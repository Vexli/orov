import { describe, expect, it } from "vitest";
import { linearRgb, linearToOklab, parseHex } from "./color";
import {
  contrastRatio,
  contrastReport,
  deltaE,
  GRAPHIC_CONTRAST,
  nearestPassing,
  simulate,
  TEXT_CONTRAST,
} from "./contrast";
import { defaultThemeValues } from "./values";

const hue = (hex: string) => {
  const [, a, b] = linearToOklab(linearRgb(parseHex(hex)!));
  return Math.atan2(b, a);
};

describe("contrastRatio", () => {
  it("matches the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // The classic just-failing grey.
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#0052c8", "#f4f5f6")).toBeCloseTo(
      contrastRatio("#f4f5f6", "#0052c8"),
      10,
    );
  });

  it("judges a translucent color as drawn on its background", () => {
    // 50% (0x80) black on white is mid-grey, not black.
    expect(contrastRatio("#00000080", "#ffffff")).toBeCloseTo(
      contrastRatio("#7f7f7f", "#ffffff"),
      6,
    );
  });
});

describe("nearestPassing", () => {
  it("finds a shade that passes and keeps the hue", () => {
    const brand = "#5b9bff"; // a light brand blue, 2.7:1 on white
    expect(contrastRatio(brand, "#ffffff")).toBeLessThan(TEXT_CONTRAST);
    const fixed = nearestPassing(brand, "#ffffff", TEXT_CONTRAST)!;
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(Math.abs(hue(fixed) - hue(brand))).toBeLessThan(0.1);
    // Nearest: a little more and it would be darker than it needs to be.
    expect(contrastRatio(fixed, "#ffffff")).toBeLessThan(TEXT_CONTRAST + 0.3);
  });

  it("lightens on a dark background", () => {
    const fixed = nearestPassing("#1d4ed8", "#0a0a0a", TEXT_CONTRAST)!;
    expect(contrastRatio(fixed, "#0a0a0a")).toBeGreaterThanOrEqual(TEXT_CONTRAST);
    expect(linearToOklab(linearRgb(parseHex(fixed)!))[0]).toBeGreaterThan(
      linearToOklab(linearRgb(parseHex("#1d4ed8")!))[0],
    );
  });
});

describe("color-vision simulation", () => {
  it("collapses red and green of equal lightness for deuteranopia, but not for normal vision", () => {
    const [red, green] = ["#dc2626", "#16a34a"];
    const normal = deltaE(linearRgb(parseHex(red)!), linearRgb(parseHex(green)!));
    const deutan = deltaE(simulate(red, "deuteranopia"), simulate(green, "deuteranopia"));
    expect(normal).toBeGreaterThan(0.3);
    expect(deutan).toBeLessThan(0.06);
  });
});

describe("contrastReport", () => {
  it("passes every check for the default theme, in both modes", () => {
    const report = contrastReport(defaultThemeValues());
    expect(report.filter((c) => !c.pass)).toEqual([]);
    expect(new Set(report.map((c) => c.mode))).toEqual(new Set(["light", "dark"]));
  });

  it("checks text at 4.5:1 and status colors at 3:1 against the map and cards", () => {
    const report = contrastReport(defaultThemeValues());
    expect(report).toContainEqual(
      expect.objectContaining({
        kind: "text",
        slot: "primary-fg",
        against: "primary",
        required: TEXT_CONTRAST,
      }),
    );
    expect(report).toContainEqual(
      expect.objectContaining({
        kind: "graphic",
        slot: "room.busy",
        against: "map.bg",
        required: GRAPHIC_CONTRAST,
      }),
    );
    expect(report).toContainEqual(
      expect.objectContaining({ kind: "graphic", slot: "presence.wfh", against: "card" }),
    );
  });

  it("reports a failure with the nearest passing shade", () => {
    const values = defaultThemeValues();
    values.light["primary"] = "#93c5fd";
    values.light["primary-fg"] = "#ffffff";
    const failure = contrastReport(values).find(
      (c) => c.kind === "text" && c.slot === "primary-fg" && c.mode === "light",
    );
    expect(failure).toMatchObject({
      pass: false,
      suggestion: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });
  });

  it("flags room colors that a color-blind viewer can't tell apart", () => {
    const values = defaultThemeValues();
    values.light["room.free"] = "#16a34a";
    values.light["room.busy"] = "#dc2626";
    const cvd = contrastReport(values).filter((c) => c.kind === "cvd" && !c.pass);
    expect(cvd).toContainEqual(
      expect.objectContaining({
        slot: "room.free",
        against: "room.busy",
        deficiency: "deuteranopia",
        mode: "light",
      }),
    );
  });

  it("checks only light mode for a light-only theme", () => {
    const report = contrastReport({ ...defaultThemeValues(), dark: null });
    expect(report.every((c) => c.mode === "light")).toBe(true);
  });
});
