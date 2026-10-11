import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures/load";
import { parseTokenFile, setNameFromFile, type ParsedFile, type TokenFile } from "./parse";
import { resolveTokens, setMode } from "./resolve";

function parse(...files: TokenFile[]): ParsedFile[] {
  return files.map((f) => {
    const { parsed, issues } = parseTokenFile(f);
    if (!parsed) throw new Error(issues.map((i) => i.message).join("; "));
    return parsed;
  });
}

const token = (files: ParsedFile[], path: string) =>
  resolveTokens(files).tokens.find((t) => t.path === path);

describe("parseTokenFile", () => {
  it("names a DTCG file's set after the file", () => {
    expect(setNameFromFile("Light.tokens.json")).toBe("Light");
    expect(setNameFromFile("exports/brand.json")).toBe("brand");
  });

  it("inherits $type from the nearest group", () => {
    const [file] = parse(fixture("Light.tokens.json"));
    const brand = file!.sets[0]!.tokens.find((t) => t.path === "color.brand.600");
    expect(brand).toMatchObject({ type: "color", declaredType: "color" });
    expect(file!.format).toBe("dtcg");
  });

  it("splits a Tokens Studio file into its sets in tokenSetOrder", () => {
    const [file] = parse(fixture("tokens-studio.json"));
    expect(file!.format).toBe("tokens_studio");
    expect(file!.sets.map((s) => s.name)).toEqual(["core", "theme/light", "theme/dark"]);
    const types = Object.fromEntries(file!.sets[0]!.tokens.map((t) => [t.path, t.type]));
    expect(types).toMatchObject({
      "space.1": "dimension",
      "radius.default": "dimension",
      "fontFamilies.body": "fontFamily",
      "fontWeights.heading": "fontWeight",
      heading: "other",
    });
  });

  it("splits a Penpot file written in DTCG syntax into its sets", () => {
    const [file] = parse(fixture("penpot.tokens.json"));
    expect(file!.format).toBe("dtcg");
    expect(file!.sets.map((s) => s.name)).toEqual(["Global", "Mode/Light", "Mode/Dark"]);
  });

  it("refuses a file with no tokens, and skips names with dots or braces", () => {
    expect(parseTokenFile({ name: "x.json", content: { a: { b: 1 } } }).parsed).toBeNull();
    expect(parseTokenFile({ name: "x.json", content: [1, 2] }).parsed).toBeNull();
    const { parsed, issues } = parseTokenFile({
      name: "x.json",
      content: { "a.b": { $value: "#fff" }, ok: { $value: "#000" } },
    });
    expect(parsed!.sets[0]!.tokens.map((t) => t.path)).toEqual(["ok"]);
    expect(issues[0]).toMatchObject({ severity: "warning", path: "a.b" });
  });
});

describe("setMode", () => {
  it.each([
    ["Dark", "dark"],
    ["theme/dark", "dark"],
    ["Mode-Light", "light"],
    ["brandDark", "dark"],
    ["core", "base"],
    ["darkness", "base"],
  ])("%s is %s", (name, mode) => {
    expect(setMode(name)).toBe(mode);
  });
});

describe("resolveTokens", () => {
  it("resolves alias chains in each mode from Figma's per-mode files", () => {
    const files = parse(fixture("Light.tokens.json"), fixture("Dark.tokens.json"));
    const resolved = resolveTokens(files);
    expect(resolved.hasDark).toBe(true);
    expect(resolved.issues).toEqual([]);
    expect(token(files, "color.background.default")).toMatchObject({
      type: "color",
      light: { hex: "#FFFFFF" },
      dark: { hex: "#121419" },
    });
  });

  it("applies base sets in both modes and resolves references across sets (Tokens Studio)", () => {
    const files = parse(fixture("tokens-studio.json"));
    const resolved = resolveTokens(files);
    expect(resolved.sets).toEqual([
      { name: "core", mode: "base" },
      { name: "theme/light", mode: "light" },
      { name: "theme/dark", mode: "dark" },
    ]);
    expect(token(files, "brand")).toMatchObject({ light: "#2563eb", dark: "#93c5fd" });
    // A base token is the same in both modes.
    expect(token(files, "radius.default")).toMatchObject({ light: "6", dark: "6" });
    // Math isn't supported: the token is skipped with a warning, not a failed import.
    expect(token(files, "space.2")).toBeUndefined();
    expect(resolved.issues).toEqual([
      expect.objectContaining({ severity: "warning", path: "space.2" }),
    ]);
  });

  it("reads per-token $extensions.mode values", () => {
    const files = parse({
      name: "t.json",
      content: { bg: { $type: "color", $value: "#fff", $extensions: { mode: { dark: "#000" } } } },
    });
    const resolved = resolveTokens(files);
    expect(resolved.hasDark).toBe(true);
    expect(resolved.tokens[0]).toMatchObject({ light: "#fff", dark: "#000" });
  });

  it("is light only when nothing gives a dark value", () => {
    const files = parse({ name: "t.json", content: { bg: { $type: "color", $value: "#fff" } } });
    const resolved = resolveTokens(files);
    expect(resolved.hasDark).toBe(false);
    expect(resolved.tokens[0]).toMatchObject({ light: "#fff", dark: undefined });
  });

  it("lets an alias take its target's type", () => {
    const files = parse({
      name: "t.json",
      content: { base: { $type: "color", $value: "#123456" }, alias: { $value: "{base}" } },
    });
    expect(token(files, "alias")).toMatchObject({ type: "color", light: "#123456" });
  });

  it("rejects circular and missing references with the path", () => {
    const files = parse({
      name: "t.json",
      content: {
        a: { $type: "color", $value: "{b}" },
        b: { $type: "color", $value: "{c}" },
        c: { $type: "color", $value: "{a}" },
        d: { $type: "color", $value: "{nope.missing}" },
        e: { $type: "color", $value: "#fff" },
      },
    });
    const resolved = resolveTokens(files);
    expect(resolved.tokens.map((t) => t.path)).toEqual(["e"]);
    const messages = resolved.issues.map((i) => i.message);
    expect(messages).toContainEqual(
      expect.stringMatching(/^Circular reference: (a|b|c) → .* → \1$/),
    );
    expect(messages).toContain("d refers to {nope.missing}, which doesn't exist");
    expect(resolved.issues.every((i) => i.severity === "error")).toBe(true);
  });
});
