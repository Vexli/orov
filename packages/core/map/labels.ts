// Where and how big the app draws a room's, point of interest's or area's name on the floor map
// (#26). Names come from the database, so a renamed room needs no new drawing, and labels follow
// the theme. All sizes are in drawing units (the SVG's viewBox), measured once per drawing.

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LabelKind = "room" | "area";

export interface LabelLayout {
  x: number;
  y: number;
  fontSize: number;
  // The name, cut short with "…" if it didn't fit even at the smallest size.
  text: string;
  truncated: boolean;
  anchor: "middle" | "start";
}

// Average advance of a sans-serif glyph, as a share of the font size. Generous, so a label
// never spills out of its box.
const GLYPH = 0.6;
const MAX_FONT = 18;
const MIN_FONT = 9;
const AREA_FONT = 16;
const AREA_INSET = 12;

// Rooms are labelled in the middle, as large as fits (up to 18). Areas are labelled in their top
// left corner, like a section heading. Null when even a three-letter label wouldn't fit.
export function labelLayout(box: LabelBox, name: string, kind: LabelKind): LabelLayout | null {
  const room = kind === "room";
  const available = room ? box.width * 0.9 : box.width - AREA_INSET * 2;
  const chars = [...name].length;
  if (chars === 0 || available <= 0) return null;

  const ceiling = room ? Math.min(MAX_FONT, box.height * 0.3) : AREA_FONT;
  if (ceiling < MIN_FONT) return null;
  let fontSize = Math.min(ceiling, available / (chars * GLYPH));
  let text = name;
  let truncated = false;
  if (fontSize < MIN_FONT) {
    fontSize = MIN_FONT;
    const fits = Math.floor(available / (MIN_FONT * GLYPH));
    if (fits < 3) return null;
    text = `${[...name].slice(0, fits - 1).join("").trimEnd()}…`;
    truncated = true;
  }
  return room
    ? { x: box.x + box.width / 2, y: box.y + box.height / 2, fontSize, text, truncated, anchor: "middle" }
    : { x: box.x + AREA_INSET, y: box.y + AREA_INSET + fontSize, fontSize, text, truncated, anchor: "start" };
}
