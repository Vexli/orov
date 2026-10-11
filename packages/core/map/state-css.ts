// The map shows state by restyling the injected drawing with one generated <style> block, keyed
// by element id (plan.md §6). A change of selection rewrites this short string; the drawing's
// hundreds of nodes are never re-rendered.
//
// Colors come only from theme slot variables, so a brand theme restyles the map without touching
// the drawing (plan.md §9.1).

import type { RoomDisplayState } from "./room-status";

export interface MapStyleState {
  // Meeting rooms and phone booths by status (U5). Drawn first, so a selection wins.
  rooms?: Partial<Record<RoomDisplayState, string[]>>;
  // Desks someone else holds, in the admin seat picker.
  occupied?: string[];
  // Seats of the highlighted team.
  highlighted: string[];
  // The focused person's desk, or the selected room. Drawn last, so it wins over a highlight.
  selected: string[];
}

export const MAP_SCOPE = "[data-floor-map]";

// Ids reach this from the database, where the parser only stores prefix-shaped ids. Anything else
// is skipped rather than escaped, so a bad row can never break out of the selector.
const SAFE_ID = /^[a-z][a-z0-9-]*$/;

function rule(ids: string[], declarations: string): string {
  const safe = [...new Set(ids)].filter((id) => SAFE_ID.test(id)).sort();
  if (safe.length === 0) return "";
  // A desk can be a group of shapes, so its children are colored too.
  const selectors = safe.flatMap((id) => [`${MAP_SCOPE} #${id}`, `${MAP_SCOPE} #${id} *`]);
  return `${selectors.join(",\n")} {\n  ${declarations}\n}\n`;
}

export function mapStateCss(state: MapStyleState): string {
  // A room's state is a tint of its status color with a solid outline, rather than a solid fill,
  // so the room's name drawn on it stays readable. The outline and the cue are what the theme's
  // 3:1 contrast check guarantees.
  const rooms = (["free", "busy", "soon", "stale"] as const).map((s) =>
    rule(
      state.rooms?.[s] ?? [],
      `fill: color-mix(in srgb, var(--room-${s}) 25%, var(--card)) !important; stroke: var(--room-${s}) !important; stroke-width: 3px !important;`,
    ),
  );
  return [
    ...rooms,
    rule(state.occupied ?? [], "fill: var(--border) !important;"),
    rule(state.highlighted, "fill: var(--map-highlight) !important;"),
    rule(
      state.selected,
      "fill: var(--map-selection) !important; stroke: var(--fg) !important; stroke-width: 3px !important;",
    ),
  ].join("");
}
