import { createHash } from "node:crypto";
import { and, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { BrandAssetKind, FontMeta } from "@officeorg/core/theme/assets";
import {
  blockingErrors,
  buildTheme,
  canApplyTheme,
  contrastFailures,
  type ThemeBuild,
  type ThemeDraft,
} from "@officeorg/core/theme/build";
import type { FontFace } from "@officeorg/core/theme/emit-css";
import type { SlotMapping } from "@officeorg/core/theme/map";
import type { TokenFile } from "@officeorg/core/theme/parse";
import type { ThemeValues } from "@officeorg/core/theme/values";
import type { Database, Executor } from "../client";
import * as s from "../schema";
import { recordAudit } from "./audit";
import { ValidationError } from "./errors";

// Themes and brand assets (plan.md §9.1). Applying a theme rebuilds it from its source files
// inside the write transaction, so what is saved never depends on what the browser previewed.

export interface ThemeInput extends ThemeDraft {
  // brand_asset ids of the fonts to declare with @font-face.
  fonts: string[];
}

export interface StoredMapping {
  slots: SlotMapping;
  darkMode: boolean;
  fonts: string[];
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

// jsonb doesn't keep key order, so metadata is compared with its keys sorted.
const canonical = (meta: unknown) =>
  JSON.stringify(Object.fromEntries(Object.entries(meta as object).sort(([a], [b]) => a.localeCompare(b))));

// Asset slots must point at an upload of the matching kind.
const ASSET_SLOTS: Record<string, BrandAssetKind> = {
  "logo.light": "logo_light",
  "logo.dark": "logo_dark",
  favicon: "favicon",
};

export async function getActiveTheme(db: Executor) {
  const row = await db.query.theme.findFirst({ where: eq(s.theme.active, true) });
  return row ? { ...row, values: row.values as ThemeValues } : null;
}

export async function getTheme(db: Executor, id: string) {
  const row = await db.query.theme.findFirst({ where: eq(s.theme.id, id) });
  if (!row) return null;
  return {
    ...row,
    values: row.values as ThemeValues,
    mapping: row.mapping as StoredMapping,
    sourceTokens: row.sourceTokens as { files: TokenFile[] },
  };
}

export async function listThemeVersions(db: Executor) {
  return db
    .select({
      id: s.theme.id,
      version: s.theme.version,
      active: s.theme.active,
      createdBy: s.theme.createdBy,
      createdAt: s.theme.createdAt,
    })
    .from(s.theme)
    .orderBy(desc(s.theme.version));
}

export async function loadFontFaces(db: Executor, ids: string[]): Promise<FontFace[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: s.brandAsset.id, meta: s.brandAsset.meta })
    .from(s.brandAsset)
    .where(and(inArray(s.brandAsset.id, ids), eq(s.brandAsset.kind, "font")));
  const byId = new Map(rows.map((r) => [r.id, r.meta as FontMeta]));
  // Keep the admin's order; ids that aren't fonts are dropped.
  return ids.flatMap((id) => {
    const meta = byId.get(id);
    return meta
      ? [{ assetId: id, family: meta.family, weight: meta.weight, style: meta.style }]
      : [];
  });
}

async function checkAssetSlots(
  db: Executor,
  build: ThemeBuild,
  fontIds: string[],
  fonts: FontFace[],
) {
  const problems: string[] = [];
  if (fonts.length !== new Set(fontIds).size)
    problems.push("A selected font is no longer uploaded.");
  const wanted = Object.entries(ASSET_SLOTS)
    .map(([slot, kind]) => ({ slot, kind, id: build.values.light[slot] ?? "" }))
    .filter((a) => a.id !== "");
  if (wanted.length > 0) {
    const rows = await db
      .select({ id: s.brandAsset.id, kind: s.brandAsset.kind })
      .from(s.brandAsset)
      .where(
        inArray(
          s.brandAsset.id,
          wanted.map((w) => w.id),
        ),
      );
    const kinds = new Map(rows.map((r) => [r.id, r.kind]));
    for (const w of wanted)
      if (kinds.get(w.id) !== w.kind)
        problems.push(`${w.slot} needs an uploaded ${w.kind.replace("_", " ")}.`);
  }
  return problems;
}

// What the Branding page shows before anything is saved.
export async function previewTheme(db: Executor, input: ThemeInput) {
  const fonts = await loadFontFaces(db, input.fonts);
  const build = buildTheme(input, fonts);
  const assetProblems = await checkAssetSlots(db, build, input.fonts, fonts);
  return { build, assetProblems };
}

export async function applyTheme(
  db: Database,
  actorEmail: string,
  input: ThemeInput,
  options: { overrideContrast: boolean },
): Promise<{ id: string; version: number }> {
  return db.transaction(async (tx) => {
    // One apply at a time, so two admins can't both take the next version number.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('officeorg.theme'))`);

    const { build, assetProblems } = await previewTheme(tx, input);
    const errors = blockingErrors(build);
    if (errors.length > 0 || assetProblems.length > 0)
      throw new ValidationError(
        `The theme has ${errors.length + assetProblems.length} error(s) to fix first: ${[
          ...errors.map((e) => e.message),
          ...assetProblems,
        ]
          .slice(0, 3)
          .join("; ")}`,
      );
    if (!canApplyTheme(build, options.overrideContrast))
      throw new ValidationError(
        `${contrastFailures(build).length} contrast check(s) fail. Fix them, or confirm you accept them.`,
      );

    const previous = await getActiveTheme(tx);
    const [{ latest } = { latest: 0 }] = await tx
      .select({ latest: max(s.theme.version) })
      .from(s.theme);
    const version = (latest ?? 0) + 1;
    const mapping: StoredMapping = {
      slots: input.mapping,
      darkMode: input.darkMode,
      fonts: input.fonts,
    };

    await tx.update(s.theme).set({ active: false }).where(eq(s.theme.active, true));
    const [row] = await tx
      .insert(s.theme)
      .values({
        version,
        sourceFormat: build.format,
        sourceTokens: { files: input.files },
        mapping,
        values: build.values,
        compiledCss: build.css,
        sha256: sha256(build.css),
        active: true,
        createdBy: actorEmail,
      })
      .returning({ id: s.theme.id });

    await recordAudit(tx, actorEmail, {
      entity: "theme",
      entityId: row!.id,
      action: "create",
      before: previous ? { id: previous.id, version: previous.version } : null,
      after: {
        version,
        mapping,
        files: input.files.map((f) => f.name),
        contrastFailuresAccepted: contrastFailures(build).length,
      },
    });
    return { id: row!.id, version };
  });
}

// Rolls back (or forward) to a saved version, or to the deploy-time default with null.
export async function activateTheme(
  db: Database,
  actorEmail: string,
  id: string | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('officeorg.theme'))`);
    const previous = await getActiveTheme(tx);
    const target = id ? await getTheme(tx, id) : null;
    if (id && !target) throw new ValidationError("That theme version no longer exists.");
    if ((previous?.id ?? null) === (id ?? null)) return;

    await tx.update(s.theme).set({ active: false }).where(eq(s.theme.active, true));
    if (id) await tx.update(s.theme).set({ active: true }).where(eq(s.theme.id, id));

    await recordAudit(tx, actorEmail, {
      entity: "theme",
      entityId: id ?? previous!.id,
      action: "update",
      before: { active: previous ? { id: previous.id, version: previous.version } : "default" },
      after: { active: target ? { id: target.id, version: target.version } : "default" },
    });
  });
}

// --- Brand assets -------------------------------------------------------------------------

export interface BrandAssetInput {
  kind: BrandAssetKind;
  mime: string;
  bytes: Buffer;
  meta: Record<string, unknown>;
}

// The same file uploaded twice for the same purpose reuses the first row.
export async function saveBrandAsset(
  db: Database,
  actorEmail: string,
  input: BrandAssetInput,
): Promise<{ id: string }> {
  const hash = sha256(input.bytes);
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: s.brandAsset.id, meta: s.brandAsset.meta })
      .from(s.brandAsset)
      .where(and(eq(s.brandAsset.kind, input.kind), eq(s.brandAsset.sha256, hash)));
    const same = existing.find((e) => canonical(e.meta) === canonical(input.meta));
    if (same) return { id: same.id };

    const [row] = await tx
      .insert(s.brandAsset)
      .values({ ...input, sha256: hash, createdBy: actorEmail })
      .returning({ id: s.brandAsset.id });
    await recordAudit(tx, actorEmail, {
      entity: "brand_asset",
      entityId: row!.id,
      action: "create",
      after: {
        kind: input.kind,
        mime: input.mime,
        sha256: hash,
        bytes: input.bytes.length,
        meta: input.meta,
      },
    });
    return { id: row!.id };
  });
}

export async function getBrandAsset(db: Executor, id: string) {
  const [row] = await db
    .select({ mime: s.brandAsset.mime, bytes: s.brandAsset.bytes, sha256: s.brandAsset.sha256 })
    .from(s.brandAsset)
    .where(eq(s.brandAsset.id, id));
  return row ?? null;
}

export async function listBrandAssets(db: Executor) {
  const rows = await db
    .select({
      id: s.brandAsset.id,
      kind: s.brandAsset.kind,
      mime: s.brandAsset.mime,
      meta: s.brandAsset.meta,
      createdAt: s.brandAsset.createdAt,
    })
    .from(s.brandAsset)
    .orderBy(desc(s.brandAsset.createdAt));
  return rows.map((r) => ({ ...r, meta: r.meta as Partial<FontMeta> & { fileName?: string } }));
}
