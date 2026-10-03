import { describe, expect, it } from "vitest";
import { roomDisplayState, ROOM_STATUS_STALE_MS } from "./room-status";
import { mapStateCss } from "./state-css";

describe("roomDisplayState", () => {
  const now = new Date("2026-10-04T10:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("shows the worker's state while it's fresh, and stale after five minutes", () => {
    expect(roomDisplayState({ state: "busy", checkedAt: ago(60_000) }, now)).toBe("busy");
    expect(roomDisplayState({ state: "soon", checkedAt: ago(ROOM_STATUS_STALE_MS) }, now)).toBe(
      "soon",
    );
    expect(roomDisplayState({ state: "free", checkedAt: ago(ROOM_STATUS_STALE_MS + 1) }, now)).toBe(
      "stale",
    );
    expect(roomDisplayState(undefined, now)).toBeNull();
  });
});

describe("mapStateCss rooms", () => {
  it("colors rooms from the room slots, before a selection that overrides them", () => {
    const css = mapStateCss({
      rooms: { busy: ["room-boardroom"], stale: ["room-phone-1"] },
      highlighted: [],
      selected: ["room-boardroom"],
    });
    expect(css).toContain(
      "[data-floor-map] #room-boardroom,\n[data-floor-map] #room-boardroom * {\n  fill: color-mix(in srgb, var(--room-busy) 25%, var(--card)) !important; stroke: var(--room-busy) !important;",
    );
    expect(css).toContain("stroke: var(--room-stale) !important;");
    expect(css.indexOf("--room-busy")).toBeLessThan(css.indexOf("--map-selection"));
    expect(css).not.toMatch(/#[0-9a-f]{3,6}\b(?![-\w])/);
  });
});
