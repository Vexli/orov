import { describe, expect, it } from "vitest";
import { mapStateCss } from "./state-css";

describe("mapStateCss", () => {
  it("is empty with nothing to show", () => {
    expect(mapStateCss({ highlighted: [], selected: [] })).toBe("");
  });

  it("colors highlighted and selected seats with theme variables only", () => {
    const css = mapStateCss({
      highlighted: ["desk-2-010", "desk-2-003"],
      selected: ["desk-2-014"],
    });
    expect(css).toContain("[data-floor-map] #desk-2-003,\n[data-floor-map] #desk-2-003 *,");
    expect(css).toContain("fill: var(--map-highlight) !important;");
    expect(css).toContain("[data-floor-map] #desk-2-014 *");
    expect(css).toContain("fill: var(--map-selection) !important;");
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });

  it("puts the selection after the highlight, so a selected team member shows as selected", () => {
    const css = mapStateCss({ highlighted: ["desk-2-014"], selected: ["desk-2-014"] });
    expect(css.indexOf("--map-selection")).toBeGreaterThan(css.indexOf("--map-highlight"));
  });

  it("is stable for the same state in any order", () => {
    expect(mapStateCss({ highlighted: ["desk-2-2", "desk-2-1", "desk-2-1"], selected: [] })).toBe(
      mapStateCss({ highlighted: ["desk-2-1", "desk-2-2"], selected: [] }),
    );
  });

  it.each(["desk-1}body{display:none", "x y", "#desk", "Desk-1", ""])(
    "skips the unsafe id %j",
    (id) => {
      expect(mapStateCss({ highlighted: [id], selected: [] })).toBe("");
    },
  );
});
