import { describe, expect, it } from "vitest";
import { buildTheme, canApplyTheme, contrastFailures, themeDraftSchema } from "./build";
import { defaultThemeCss, emitThemeCss } from "./emit-css";
import { exportThemeTokens } from "./export";
import { fixture } from "./fixtures/load";
import { applyMapping, suggestMapping } from "./map";
import { parseTokenFile } from "./parse";
import { resolveTokens } from "./resolve";
import { SLOTS } from "./slots";
import { defaultThemeValues } from "./values";

function tokensOf(...names: string[]) {
  return resolveTokens(names.map((n) => parseTokenFile(fixture(n)).parsed!)).tokens;
}

describe("suggestMapping", () => {
  it("maps Figma's semantic names onto slots, and never a token of the wrong type", () => {
    const mapping = suggestMapping(tokensOf("Light.tokens.json", "Dark.tokens.json"));
    expect(mapping).toMatchObject({
      bg: { token: "color.background.default" },
      fg: { token: "color.text.default" },
      "muted-fg": { token: "color.text.subtle" },
      muted: { token: "color.background.subtle" },
      primary: { token: "color.action.primary" },
      "radius.base": { token: "radius.md" },
      "font.sans": { token: "font.family.body" },
    });
    // No dimension or font token was taken for a color slot.
    expect(mapping["border"]).toBeUndefined();
  });

  it("maps Tokens Studio names", () => {
    const mapping = suggestMapping(tokensOf("tokens-studio.json"));
    expect(mapping).toMatchObject({
      bg: { token: "background" },
      fg: { token: "foreground" },
      primary: { token: "brand" },
      destructive: { token: "danger" },
      "font.sans": { token: "fontFamilies.body" },
      "font.weight.heading": { token: "fontWeights.heading" },
    });
  });

  it("keeps what the admin already mapped", () => {
    const mapping = suggestMapping(tokensOf("tokens-studio.json"), {
      primary: { token: "danger" },
    });
    expect(mapping["primary"]).toEqual({ token: "danger" });
  });
});

describe("applyMapping", () => {
  const tokens = tokensOf("Light.tokens.json", "Dark.tokens.json");

  it("uses each mode's value, and the default for unmapped slots", () => {
    const { values, issues } = applyMapping(
      tokens,
      { primary: { token: "color.action.primary" } },
      { darkMode: true },
    );
    expect(issues).toEqual([]);
    expect(values.light["primary"]).toBe("#0052c8");
    expect(values.dark!["primary"]).toBe("#79a3ff");
    expect(values.light["bg"]).toBe(defaultThemeValues().light["bg"]);
  });

  it("drops dark values for a light-only theme", () => {
    const { values } = applyMapping(tokens, {}, { darkMode: false });
    expect(values.dark).toBeNull();
  });

  it("adds a generic fallback to a font list that has none", () => {
    const { values } = applyMapping(
      [],
      { "font.sans": { light: "Inter" }, "font.mono": { light: "JetBrains Mono, monospace" } },
      { darkMode: false },
    );
    expect(values.light["font.sans"]).toBe('"Inter", sans-serif');
    expect(values.light["font.mono"]).toBe('"JetBrains Mono", monospace');
  });

  it("accepts typed values, with an optional dark value", () => {
    const { values, issues } = applyMapping(
      [],
      {
        primary: { light: "#123456" },
        accent: { light: "#fef3c7", dark: "#422006" },
        appName: { light: "Acme" },
      },
      { darkMode: true },
    );
    expect(issues).toEqual([]);
    expect(values.dark!["primary"]).toBe("#123456");
    expect(values.dark!["accent"]).toBe("#422006");
    expect(values.light["appName"]).toBe("Acme");
  });

  it("warns and falls back when a mapped token has gone, and errors on a wrong type or bad value", () => {
    const { values, issues } = applyMapping(
      tokens,
      {
        bg: { token: "color.renamed" },
        fg: { token: "radius.md" },
        "radius.base": { light: "1em" },
      },
      { darkMode: true },
    );
    expect(values.light["bg"]).toBe(defaultThemeValues().light["bg"]);
    expect(issues.map((i) => [i.severity, i.path])).toEqual([
      ["warning", "bg"],
      ["error", "fg"],
      ["error", "radius.base"],
      ["error", "radius.base"],
    ]);
  });
});

describe("emitThemeCss", () => {
  it("writes every CSS slot, the density step and the dark overrides", () => {
    const css = defaultThemeCss();
    for (const slot of SLOTS) if (slot.cssVar) expect(css).toContain(`  ${slot.cssVar}: `);
    expect(css).toContain("--theme-spacing: calc(var(--theme-spacing-base) * 1);");
    const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    expect(dark).toContain("--bg: #0a0a0a;");
    expect(dark).not.toContain("--theme-radius");
  });

  it("scales spacing for the compact density", () => {
    const values = defaultThemeValues();
    values.light["density"] = "compact";
    expect(emitThemeCss(values)).toContain("calc(var(--theme-spacing-base) * 0.875)");
  });

  it("writes a light-only theme without the dark block", () => {
    const css = emitThemeCss({ ...defaultThemeValues(), dark: null });
    expect(css).toContain("color-scheme: light;");
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("declares uploaded fonts same-origin, and drops a face with a bad family or id", () => {
    const css = emitThemeCss(defaultThemeValues(), [
      { assetId: "ba_abc123def456ghi789", family: "Acme Sans", weight: 400, style: "normal" },
      {
        assetId: "ba_abc123def456ghi789",
        family: 'x"; } body { color: red',
        weight: 400,
        style: "normal",
      },
      { assetId: "../../secret", family: "Acme Sans", weight: 700, style: "normal" },
    ]);
    expect(css.match(/@font-face/g)).toHaveLength(1);
    expect(css).toContain('src: url("/api/brand-assets/ba_abc123def456ghi789") format("woff2");');
    expect(css).not.toContain("color: red");
  });
});

describe("buildTheme", () => {
  it("turns Figma's light and dark files into a theme that maps, validates and emits", () => {
    const tokens = tokensOf("Light.tokens.json", "Dark.tokens.json");
    const build = buildTheme({
      files: [fixture("Light.tokens.json"), fixture("Dark.tokens.json")],
      mapping: suggestMapping(tokens),
      darkMode: true,
    });
    expect(build.issues).toEqual([]);
    expect(build.hasDarkTokens).toBe(true);
    expect(build.files.map((f) => f.sets[0]!.mode)).toEqual(["light", "dark"]);
    expect(build.css).toContain("  --primary: #0052c8;");
    expect(build.css).toContain('  --theme-font-sans: "Acme Sans", "Helvetica Neue", sans-serif;');
    expect(build.css).toContain("  --theme-radius: 8px;");
  });

  it("blocks on errors, and on contrast failures unless overridden", () => {
    const failing = buildTheme({
      files: [],
      mapping: { primary: { light: "#fde68a" } },
      darkMode: false,
    });
    expect(contrastFailures(failing).length).toBeGreaterThan(0);
    expect(canApplyTheme(failing, false)).toBe(false);
    expect(canApplyTheme(failing, true)).toBe(true);

    const broken = buildTheme({
      files: [{ name: "t.json", content: { a: { $type: "color", $value: "{a}" } } }],
      mapping: {},
      darkMode: false,
    });
    expect(canApplyTheme(broken, true)).toBe(false);
  });

  it("round-trips: an exported theme imports back onto every slot with the same values", () => {
    const values = defaultThemeValues();
    values.light["primary"] = "#0052c8";
    values.dark!["primary"] = "#79a3ff";
    values.light["density"] = "compact";
    values.light["font.sans"] = '"Acme Sans", sans-serif';
    values.light["appName"] = "Acme Office";
    const file = { name: "officeorg-theme.tokens.json", content: exportThemeTokens(values) };

    const first = buildTheme({ files: [file], mapping: {}, darkMode: true });
    const mapping = suggestMapping(first.tokens);
    for (const slot of SLOTS.filter((s) => s.kind !== "asset"))
      expect(mapping[slot.name], slot.name).toEqual({ token: slot.name });

    const second = buildTheme({ files: [file], mapping, darkMode: true });
    expect(second.issues).toEqual([]);
    expect(second.values.light).toEqual(values.light);
    // Only differing dark values are exported; the rest follow the light value, as before.
    for (const slot of SLOTS)
      expect(second.values.dark![slot.name], slot.name).toBe(
        values.dark![slot.name] ?? values.light[slot.name],
      );
  });
});

describe("themeDraftSchema", () => {
  it("rejects unknown slots and malformed entries", () => {
    expect(
      themeDraftSchema.safeParse({
        files: [],
        mapping: { nope: { light: "#fff" } },
        darkMode: true,
      }).success,
    ).toBe(false);
    expect(
      themeDraftSchema.safeParse({
        files: [],
        mapping: { bg: { token: "a", light: "#fff" } },
        darkMode: true,
      }).success,
    ).toBe(false);
    expect(
      themeDraftSchema.safeParse({ files: [], mapping: { bg: { token: "a" } }, darkMode: true })
        .success,
    ).toBe(true);
  });
});
