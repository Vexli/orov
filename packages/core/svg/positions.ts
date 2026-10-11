import { JSDOM } from "jsdom";
import { center, elementBounds } from "./geometry";

// The centre of each desk in a sanitized floor drawing, in its own units, with transforms
// applied. The database keeps no coordinates, so the seating planner (N10) reads them here.
// Server only (it loads jsdom), like parse.ts.
export function deskCenters(svg: string): Map<string, { x: number; y: number }> {
  const root = JSDOM.fragment(svg).firstElementChild;
  const centers = new Map<string, { x: number; y: number }>();
  if (!root || root.tagName.toLowerCase() !== "svg") return centers;
  for (const el of Array.from(root.querySelectorAll('[id^="desk-"]'))) {
    const box = elementBounds(el, root);
    if (!box) continue;
    const [x, y] = center(box);
    centers.set(el.getAttribute("id")!, { x, y });
  }
  return centers;
}
