import { describe, expect, it } from "vitest";
import {
  emitLocationThemeCss,
  locationThemeReport,
  locationThemeSchema,
  withLocationTheme,
} from "./location-override";
import { defaultThemeValues } from "./values";

const theme = defaultThemeValues();
const lightOnly = { light: theme.light, dark: null };

describe("locationThemeSchema", () => {
  it("keeps valid map slots, drops blanks, and normalizes values", () => {
    const parsed = locationThemeSchema.parse({
      light: { "map.selection": " #7C3AED ", "room.free": "" },
      dark: { "map.dim-opacity": "0.4" },
    });
    expect(parsed).toEqual({ light: { "map.selection": "#7c3aed" }, dark: { "map.dim-opacity": "0.4" } });
  });

  it("is null when nothing is set", () => {
    expect(locationThemeSchema.parse({ light: { "map.bg": "" } })).toBeNull();
  });

  it("refuses slots outside the map, and values outside the grammar", () => {
    expect(locationThemeSchema.safeParse({ light: { primary: "#000000" } }).success).toBe(false);
    expect(locationThemeSchema.safeParse({ light: { "map.bg": "red; } body { display: none" } }).success).toBe(false);
    expect(locationThemeSchema.safeParse({ light: { "map.dim-opacity": "2" } }).success).toBe(false);
  });
});

describe("withLocationTheme", () => {
  it("uses a light-only value in dark mode too, unless dark is set", () => {
    const merged = withLocationTheme(theme, { light: { "map.selection": "#7c3aed", "map.bg": "#ffffff" }, dark: { "map.bg": "#000000" } });
    expect(merged.light["map.selection"]).toBe("#7c3aed");
    expect(merged.dark!["map.selection"]).toBe("#7c3aed");
    expect(merged.dark!["map.bg"]).toBe("#000000");
    expect(merged.light.primary).toBe(theme.light.primary);
  });

  it("ignores dark values for a light-only theme", () => {
    expect(withLocationTheme(lightOnly, { light: {}, dark: { "map.bg": "#000000" } }).dark).toBeNull();
  });
});

describe("locationThemeReport", () => {
  it("reports only checks that involve an overridden slot", () => {
    const report = locationThemeReport(theme, { light: { "room.busy": "#fca5a5" }, dark: {} });
    expect(report.length).toBeGreaterThan(0);
    expect(report.every((c) => c.slot === "room.busy" || c.against === "room.busy")).toBe(true);
    // A pale red on the light map background fails the 3:1 graphic check.
    expect(report.some((c) => !c.pass && c.mode === "light" && c.kind === "graphic")).toBe(true);
  });

  it("is empty without an override", () => {
    expect(locationThemeReport(theme, null)).toEqual([]);
  });
});

describe("emitLocationThemeCss", () => {
  it("scopes the values to the office, with a dark block when the theme has dark mode", () => {
    const css = emitLocationThemeCss("loc_sf", theme, { light: { "map.selection": "#7c3aed" }, dark: { "map.bg": "#000000" } });
    expect(css).toBe(
      [
        '[data-location-theme="loc_sf"] {',
        "  --map-selection: #7c3aed;",
        "}",
        "@media (prefers-color-scheme: dark) {",
        '  [data-location-theme="loc_sf"] {',
        "    --map-bg: #000000;",
        "    --map-selection: #7c3aed;",
        "  }",
        "}",
      ].join("\n"),
    );
  });

  it("writes no dark block for a light-only theme", () => {
    expect(emitLocationThemeCss("loc_sf", lightOnly, { light: { "map.bg": "#ffffff" }, dark: { "map.bg": "#000000" } })).not.toContain("@media");
  });

  it("drops values that fail the grammar, and refuses an unsafe scope id", () => {
    const tampered = { light: { "map.bg": "red} body{display:none" }, dark: {} };
    expect(emitLocationThemeCss("loc_sf", theme, tampered)).toBe("");
    expect(emitLocationThemeCss('x"]{}*{', theme, { light: { "map.bg": "#ffffff" }, dark: {} })).toBe("");
  });
});
