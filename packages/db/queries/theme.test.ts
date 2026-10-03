import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { listAudit } from "./audit";
import { ValidationError } from "./errors";
import {
  activateTheme,
  applyTheme,
  getActiveTheme,
  getBrandAsset,
  listThemeVersions,
  previewTheme,
  saveBrandAsset,
  type ThemeInput,
} from "./theme";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await t.reset();
});

const ACTOR = "jane@example.com";
const OK = { overrideContrast: false };

const BRAND_FILE = {
  name: "brand.tokens.json",
  content: { brand: { $type: "color", $value: "#0052c8" } },
};

function input(overrides: Partial<ThemeInput> = {}): ThemeInput {
  return {
    files: [BRAND_FILE],
    mapping: { primary: { token: "brand" } },
    // The file has one mode, so the theme is light only. With dark mode on, the brand blue
    // would also be used under the default dark primary-fg, which fails contrast.
    darkMode: false,
    fonts: [],
    ...overrides,
  };
}

const WOFF2 = Buffer.from([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe("applyTheme", () => {
  it("saves version 1 as the active theme, with its compiled CSS and an audit entry", async () => {
    expect(await getActiveTheme(t.db)).toBeNull();
    const saved = await applyTheme(t.db, ACTOR, input(), OK);
    expect(saved.version).toBe(1);

    const active = await getActiveTheme(t.db);
    expect(active).toMatchObject({
      id: saved.id,
      version: 1,
      sourceFormat: "dtcg",
      createdBy: ACTOR,
    });
    expect(active!.compiledCss).toContain("--primary: #0052c8;");
    expect(active!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(active!.values.light["primary"]).toBe("#0052c8");

    const [entry] = await listAudit(t.db, { entity: "theme" });
    expect(entry).toMatchObject({ entityId: saved.id, action: "create", actorEmail: ACTOR });
  });

  it("deactivates the previous version, so only one is active", async () => {
    await applyTheme(t.db, ACTOR, input(), OK);
    const second = await applyTheme(t.db, ACTOR, input({ darkMode: false }), OK);
    expect(second.version).toBe(2);
    const versions = await listThemeVersions(t.db);
    expect(versions.map((v) => [v.version, v.active])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it("refuses a theme with errors, whatever the override", async () => {
    const broken = input({
      files: [{ name: "t.json", content: { a: { $type: "color", $value: "{missing}" } } }],
    });
    await expect(applyTheme(t.db, ACTOR, broken, { overrideContrast: true })).rejects.toThrow(
      ValidationError,
    );
    expect(await listThemeVersions(t.db)).toEqual([]);
  });

  it("refuses contrast failures unless the admin overrides them", async () => {
    const pale = input({ mapping: { primary: { light: "#fde68a" } } });
    await expect(applyTheme(t.db, ACTOR, pale, OK)).rejects.toThrow(/contrast/);
    const saved = await applyTheme(t.db, ACTOR, pale, { overrideContrast: true });
    const [entry] = await listAudit(t.db, { entity: "theme" });
    expect(entry!.after).toMatchObject({ contrastFailuresAccepted: expect.any(Number) });
    expect(saved.version).toBe(1);
  });

  it("gives concurrent applies distinct versions", async () => {
    const results = await Promise.all([1, 2, 3].map(() => applyTheme(t.db, ACTOR, input(), OK)));
    expect(results.map((r) => r.version).sort()).toEqual([1, 2, 3]);
    const active = await t.db.select().from(s.theme).where(eq(s.theme.active, true));
    expect(active).toHaveLength(1);
  });
});

describe("activateTheme", () => {
  it("rolls back to an earlier version, and to the default", async () => {
    const v1 = await applyTheme(t.db, ACTOR, input(), OK);
    await applyTheme(t.db, ACTOR, input({ mapping: {} }), OK);

    await activateTheme(t.db, ACTOR, v1.id);
    expect((await getActiveTheme(t.db))?.version).toBe(1);
    // Rolling back adds no version.
    expect(await listThemeVersions(t.db)).toHaveLength(2);

    await activateTheme(t.db, ACTOR, null);
    expect(await getActiveTheme(t.db)).toBeNull();

    const entries = await listAudit(t.db, { entity: "theme" });
    expect(entries[0]).toMatchObject({ action: "update", after: { active: "default" } });
    expect(entries[1]).toMatchObject({ action: "update", after: { active: { version: 1 } } });
  });

  it("rejects an unknown version", async () => {
    await expect(activateTheme(t.db, ACTOR, "theme_nope")).rejects.toThrow(ValidationError);
  });
});

describe("brand assets", () => {
  it("stores bytes, reuses an identical upload, and audits the first", async () => {
    const meta = { family: "Acme Sans", weight: 400, style: "normal" };
    const first = await saveBrandAsset(t.db, ACTOR, {
      kind: "font",
      mime: "font/woff2",
      bytes: WOFF2,
      meta,
    });
    const again = await saveBrandAsset(t.db, ACTOR, {
      kind: "font",
      mime: "font/woff2",
      bytes: WOFF2,
      meta,
    });
    expect(again.id).toBe(first.id);
    expect(first.id).toMatch(/^ba_/);

    const stored = await getBrandAsset(t.db, first.id);
    expect(Buffer.compare(stored!.bytes, WOFF2)).toBe(0);
    expect(stored!.mime).toBe("font/woff2");
    expect(await listAudit(t.db, { entity: "brand_asset" })).toHaveLength(1);
  });

  it("declares a theme's fonts and checks its logo slots point at the right kind of upload", async () => {
    const font = await saveBrandAsset(t.db, ACTOR, {
      kind: "font",
      mime: "font/woff2",
      bytes: WOFF2,
      meta: { family: "Acme Sans", weight: 700, style: "normal" },
    });
    const logo = await saveBrandAsset(t.db, ACTOR, {
      kind: "logo_light",
      mime: "image/png",
      bytes: PNG,
      meta: {},
    });

    const good = await previewTheme(
      t.db,
      input({ fonts: [font.id], mapping: { "logo.light": { light: logo.id } } }),
    );
    expect(good.assetProblems).toEqual([]);
    expect(good.build.css).toContain(`url("/api/brand-assets/${font.id}")`);
    expect(good.build.css).toContain("font-weight: 700;");

    const wrong = await previewTheme(t.db, input({ mapping: { favicon: { light: logo.id } } }));
    expect(wrong.assetProblems).toEqual(["favicon needs an uploaded favicon."]);
    await expect(
      applyTheme(t.db, ACTOR, input({ mapping: { favicon: { light: logo.id } } }), OK),
    ).rejects.toThrow(/favicon/);
  });
});
