import { describe, expect, it } from "vitest";
import {
  parseColor,
  parseDensity,
  parseDimension,
  parseFontFamily,
  parseFontWeight,
  parseOpacity,
  parseSlotValue,
  parseText,
} from "./validate";

const ok = (value: string) => ({ ok: true, value });

describe("parseColor", () => {
  it.each([
    ["#FFF", "#ffffff"],
    ["#0052C8", "#0052c8"],
    ["#0052c880", "#0052c880"],
    ["#0052c8ff", "#0052c8"],
    ["rgb(255, 0, 0)", "#ff0000"],
    ["rgba(220, 38, 38, 1)", "#dc2626"],
    ["rgb(255 0 0 / 50%)", "#ff000080"],
    ["rgb(100% 0% 0%)", "#ff0000"],
    ["hsl(0, 100%, 50%)", "#ff0000"],
    ["hsl(120 100% 25%)", "#008000"],
  ])("%s → %s", (raw, value) => {
    expect(parseColor(raw)).toEqual(ok(value));
  });

  it("reads DTCG 2025.10 color objects", () => {
    expect(
      parseColor({ colorSpace: "srgb", components: [0, 0.322, 0.784], hex: "#0052C8" }),
    ).toEqual(ok("#0052c8"));
    expect(parseColor({ colorSpace: "srgb", components: [1, 0, 0], alpha: 0.5 })).toEqual(
      ok("#ff000080"),
    );
    expect(parseColor({ colorSpace: "hsl", components: [0, 100, 50] })).toEqual(ok("#ff0000"));
    // An unsupported color space falls back to the hex Figma includes.
    expect(parseColor({ colorSpace: "display-p3", components: [1, 0, 0], hex: "#ff0000" })).toEqual(
      ok("#ff0000"),
    );
    expect(parseColor({ colorSpace: "oklch", components: [0.5, 0.1, 30] })).toMatchObject({
      ok: false,
      error: expect.stringContaining("sRGB"),
    });
  });

  it.each([
    "red",
    "#12345",
    "rgb(300, 0, 0)",
    "url(https://evil.example/x.png)",
    "#fff; } body { background: red",
    "var(--bg)",
    "rgb(1,2,3);color:red",
  ])("rejects %s", (raw) => {
    expect(parseColor(raw).ok).toBe(false);
  });
});

describe("parseDimension", () => {
  it.each<[unknown, string]>([
    ["16px", "16px"],
    ["0.375rem", "0.375rem"],
    ["0", "0px"],
    [8, "8px"],
    ["6", "6px"],
    [{ value: 1.25, unit: "rem" }, "1.25rem"],
  ])("%j → %s", (raw, value) => {
    expect(parseDimension(raw)).toEqual(ok(value));
  });

  it.each<unknown>([
    "16em",
    "-4px",
    "calc(1px + 1px)",
    "16px;}",
    "2000px",
    { value: 1, unit: "vh" },
    null,
  ])("rejects %j", (raw) => {
    expect(parseDimension(raw).ok).toBe(false);
  });
});

describe("parseOpacity", () => {
  it.each<[unknown, string]>([
    [0.25, "0.25"],
    ["0.45", "0.45"],
    ["45%", "0.45"],
    [1, "1"],
  ])("%j → %s", (raw, value) => {
    expect(parseOpacity(raw)).toEqual(ok(value));
  });

  it.each<unknown>([1.5, "-0.1", "half", null])("rejects %j", (raw) => {
    expect(parseOpacity(raw).ok).toBe(false);
  });
});

describe("parseFontWeight", () => {
  it.each<[unknown, string]>([
    [600, "600"],
    ["700", "700"],
    ["bold", "700"],
    ["Semi Bold", "600"],
    ["semibold", "600"],
    ["semi-bold", "600"],
    ["Extra_Black", "950"],
  ])("%j → %s", (raw, value) => {
    expect(parseFontWeight(raw)).toEqual(ok(value));
  });

  it.each<unknown>([0, 1001, 550.5, "heavyish", "700;"])("rejects %j", (raw) => {
    expect(parseFontWeight(raw).ok).toBe(false);
  });
});

describe("parseFontFamily", () => {
  it("quotes names and leaves generic families bare", () => {
    expect(parseFontFamily(["Acme Sans", "Helvetica Neue", "sans-serif"])).toEqual(
      ok('"Acme Sans", "Helvetica Neue", sans-serif'),
    );
    expect(parseFontFamily("'Inter', system-ui")).toEqual(ok('"Inter", system-ui'));
    expect(parseFontFamily("Noto Sans JP")).toEqual(ok('"Noto Sans JP"'));
  });

  it.each<unknown>([
    'Inter"; } * { color: red; } x { font-family: "',
    "Inter\\",
    "Inter, url(x)",
    "",
    [],
    [1],
    "a,b,c,d,e,f,g,h,i,j,k",
  ])("rejects %j", (raw) => {
    expect(parseFontFamily(raw).ok).toBe(false);
  });
});

describe("other kinds", () => {
  it("density is compact or comfortable", () => {
    expect(parseDensity("Compact")).toEqual(ok("compact"));
    expect(parseDensity("cozy").ok).toBe(false);
  });

  it("text is a short, single-line name", () => {
    expect(parseText("  Acme Office  ")).toEqual(ok("Acme Office"));
    expect(parseText("Acme\nOffice").ok).toBe(false);
    expect(parseText("x".repeat(61)).ok).toBe(false);
  });

  it("asset is an uploaded file id or nothing", () => {
    expect(parseSlotValue("asset", "")).toEqual(ok(""));
    expect(parseSlotValue("asset", "ba_abc123def456ghi789jkl0")).toEqual(
      ok("ba_abc123def456ghi789jkl0"),
    );
    expect(parseSlotValue("asset", "../../etc/passwd").ok).toBe(false);
  });
});
