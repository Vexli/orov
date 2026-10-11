import { JSDOM } from "jsdom";

// Edits to a floor drawing made in the browser (#21): place a desk, draw a room, remove one. Each
// returns a new drawing, which then goes through the normal upload pipeline (sanitize, parse,
// diff preview, apply as a new version), so the drawing and the database never drift apart.
// Server only (it loads jsdom), like parse.ts.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DrawingEdit =
  | { kind: "addDesk"; rect: Rect }
  | { kind: "addRoom"; rect: Rect; name: string }
  | { kind: "remove"; svgElementId: string };

export class DrawingEditError extends Error {}

// "Fjord", "Phone 3", "Café Bleu" → "fjord", "phone-3", "cafe-bleu". Ids stay ASCII on purpose
// (docs/map-authoring.md).
export function slugFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const round = (n: number) => Math.round(n * 10) / 10;

function rectElement(doc: Document, id: string, rect: Rect): Element {
  const el = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
  el.setAttribute("id", id);
  el.setAttribute("x", String(round(rect.x)));
  el.setAttribute("y", String(round(rect.y)));
  el.setAttribute("width", String(round(rect.width)));
  el.setAttribute("height", String(round(rect.height)));
  el.setAttribute("rx", "4");
  return el;
}

function checkRect(rect: Rect, viewBox: number[]) {
  const [vx = 0, vy = 0, vw = 0, vh = 0] = viewBox;
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (!values.every(Number.isFinite) || rect.width < 4 || rect.height < 4) {
    throw new DrawingEditError("Draw a bigger shape.");
  }
  if (rect.x < vx || rect.y < vy || rect.x + rect.width > vx + vw || rect.y + rect.height > vy + vh) {
    throw new DrawingEditError("The shape has to be inside the drawing.");
  }
}

// `floorSlug` numbers a new desk ("desk-<floor>-<n>"), after the highest number on the floor.
export function editDrawing(svg: string, floorSlug: string, edit: DrawingEdit): { svg: string; svgElementId: string } {
  const dom = new JSDOM(svg, { contentType: "image/svg+xml" });
  const doc = dom.window.document;
  const root = doc.documentElement;
  if (root.tagName.toLowerCase() !== "svg") throw new DrawingEditError("The drawing has no <svg> element.");
  const viewBox = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  const ids = new Set(Array.from(doc.querySelectorAll("[id]"), (el) => el.getAttribute("id")!));

  let svgElementId: string;
  if (edit.kind === "remove") {
    svgElementId = edit.svgElementId;
    if (!/^(desk|room)-/.test(svgElementId)) throw new DrawingEditError("Only desks and rooms can be removed here.");
    const el = Array.from(doc.querySelectorAll("[id]")).find((e) => e.getAttribute("id") === svgElementId);
    if (!el) throw new DrawingEditError(`${svgElementId} isn't in the drawing.`);
    el.remove();
  } else if (edit.kind === "addDesk") {
    checkRect(edit.rect, viewBox);
    const prefix = `desk-${floorSlug}-`;
    const numbers = [...ids].filter((id) => id.startsWith(prefix)).map((id) => Number(id.slice(prefix.length)));
    const next = Math.max(0, ...numbers.filter(Number.isFinite)) + 1;
    svgElementId = `${prefix}${String(next).padStart(3, "0")}`;
    root.appendChild(rectElement(doc, svgElementId, edit.rect));
  } else {
    checkRect(edit.rect, viewBox);
    const slug = slugFromName(edit.name);
    if (!slug) throw new DrawingEditError("Give the room a name with at least one letter or digit.");
    svgElementId = `room-${slug}`;
    for (let n = 2; ids.has(svgElementId); n++) svgElementId = `room-${slug}-${n}`;
    root.appendChild(rectElement(doc, svgElementId, edit.rect));
  }
  return { svg: root.outerHTML, svgElementId };
}
