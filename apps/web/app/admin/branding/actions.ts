"use server";

import { revalidatePath } from "next/cache";
import {
  BRAND_ASSET_KINDS,
  checkBrandAsset,
  fontMetaSchema,
  type BrandAssetKind,
} from "@officeorg/core/theme/assets";
import { themeInputSchema, type ThemeBuild } from "@officeorg/core/theme/build";
import { sanitizeSvg, SvgError } from "@officeorg/core/svg/sanitize";
import { getDb } from "@officeorg/db/client";
import { ValidationError } from "@officeorg/db/queries/errors";
import {
  activateTheme,
  applyTheme,
  previewTheme,
  saveBrandAsset,
  type ThemeInput,
} from "@officeorg/db/queries/theme";
import { requireAdmin } from "@/lib/session";

// Server actions for the Branding page (plan.md §9.1). They're public endpoints, so every
// argument is parsed again here rather than trusted from the editor.

export type PreviewResult =
  { ok: true; build: ThemeBuild; assetProblems: string[] } | { ok: false; error: string };

export type ActionResult = { ok: true; version?: number } | { ok: false; error: string };

function parseInput(input: unknown): ThemeInput | string {
  const parsed = themeInputSchema.safeParse(input);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "The theme couldn't be read";
  return parsed.data as ThemeInput;
}

async function attempt<T>(run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

function revalidateEverything() {
  // The theme is part of every page's layout.
  revalidatePath("/", "layout");
}

export async function previewThemeAction(input: unknown): Promise<PreviewResult> {
  await requireAdmin();
  const parsed = parseInput(input);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  const { build, assetProblems } = await previewTheme(getDb(), parsed);
  return { ok: true, build, assetProblems };
}

export async function applyThemeAction(
  input: unknown,
  overrideContrast: unknown,
): Promise<ActionResult> {
  const user = await requireAdmin();
  const parsed = parseInput(input);
  if (typeof parsed === "string") return { ok: false, error: parsed };
  return attempt(async () => {
    const saved = await applyTheme(getDb(), user.email, parsed, {
      overrideContrast: overrideContrast === true,
    });
    revalidateEverything();
    return { ok: true as const, version: saved.version };
  });
}

// A version's id, or null for the deploy-time default.
export async function activateThemeAction(id: unknown): Promise<ActionResult> {
  const user = await requireAdmin();
  if (id !== null && (typeof id !== "string" || !/^theme_[a-z0-9]+$/.test(id)))
    return { ok: false, error: "Bad request" };
  return attempt(async () => {
    await activateTheme(getDb(), user.email, id);
    revalidateEverything();
    return { ok: true as const };
  });
}

export type UploadResult =
  | { ok: true; id: string; kind: BrandAssetKind; meta: Record<string, unknown> }
  | { ok: false; error: string };

// A logo, favicon or font. The type comes from the file's bytes; SVGs are sanitized like floor
// drawings before they're stored.
export async function uploadBrandAssetAction(form: FormData): Promise<UploadResult> {
  const user = await requireAdmin();
  const kind = form.get("kind");
  const file = form.get("file");
  if (typeof kind !== "string" || !BRAND_ASSET_KINDS.includes(kind as BrandAssetKind))
    return { ok: false, error: "Bad request" };
  if (!(file instanceof File)) return { ok: false, error: "Choose a file" };

  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const check = checkBrandAsset(kind as BrandAssetKind, bytes);
  if (!check.ok) return check;

  let meta: Record<string, unknown> = { fileName: file.name.slice(0, 200) };
  if (kind === "font") {
    const font = fontMetaSchema.safeParse({
      family: form.get("family"),
      weight: form.get("weight"),
      style: form.get("style"),
    });
    if (!font.success)
      return {
        ok: false,
        error: `Font ${String(font.error.issues[0]?.path[0] ?? "")}: ${font.error.issues[0]?.message}`,
      };
    meta = { ...meta, ...font.data };
  }
  if (check.mime === "image/svg+xml") {
    try {
      bytes = new TextEncoder().encode(sanitizeSvg(new TextDecoder().decode(bytes)));
    } catch (error) {
      if (error instanceof SvgError) return { ok: false, error: error.message };
      throw error;
    }
  }

  const saved = await saveBrandAsset(getDb(), user.email, {
    kind: kind as BrandAssetKind,
    mime: check.mime,
    bytes: Buffer.from(bytes),
    meta,
  });
  revalidatePath("/admin/branding");
  return { ok: true, id: saved.id, kind: kind as BrandAssetKind, meta };
}
