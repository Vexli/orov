import { JSDOM } from "jsdom";
import { center, contains, elementBounds, type Box } from "./geometry";

// Reads the desks, rooms and areas out of a sanitized floor drawing, following the id rules in
// docs/map-authoring.md. Pure apart from parsing the markup, and server only (it loads jsdom).

export type SpaceKind =
  | "desk"
  | "meeting_room"
  | "phone_booth"
  | "kitchen"
  | "elevator"
  | "restroom"
  | "other";

export interface ParsedArea {
  svgElementId: string;
  slug: string;
  // Used only when the area is new. An existing area keeps the name it has.
  name: string;
}

export interface ParsedSpace {
  svgElementId: string;
  kind: SpaceKind;
  name: string;
  areaSvgElementId: string | null;
}

export interface ParsedFloor {
  viewBox: Box;
  areas: ParsedArea[];
  spaces: ParsedSpace[];
  // Problems that stop the drawing from being applied, such as a duplicate id.
  errors: string[];
}

export interface FloorContext {
  // The floor's slug, which every desk id on it must carry ("desk-2-014" on floor "2").
  floorSlug: string;
  // The office's slug, which starts every desk code ("SF-2-014").
  locationSlug: string;
}

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const AREA_ID = new RegExp(`^area-(${SLUG})$`);
const DESK_ID = /^desk-([a-z0-9]+(?:-[a-z0-9]+)*)-(\d+)$/;
const ROOM_ID = new RegExp(`^room-(${SLUG})$`);
const POI_ID = /^poi-([a-z]+)(?:-(\d+))?$/;
const PREFIXES = ["area-", "desk-", "room-", "poi-"];

const POI_KINDS: Record<string, SpaceKind> = {
  kitchen: "kitchen",
  elevator: "elevator",
  restroom: "restroom",
};

// "huddle-a" → "Huddle A"
export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

// "sf", "2", "014" → "SF-2-014"
export function deskCode(locationSlug: string, floorSlug: string, number: string): string {
  return `${locationSlug}-${floorSlug}-${number}`.toUpperCase();
}

export function parseFloorSvg(svg: string, context: FloorContext): ParsedFloor {
  const fragment = JSDOM.fragment(svg);
  const root = fragment.firstElementChild;
  if (!root || root.tagName.toLowerCase() !== "svg") {
    return {
      viewBox: { x: 0, y: 0, width: 0, height: 0 },
      areas: [],
      spaces: [],
      errors: ["The drawing has no <svg> element."],
    };
  }
  const [vx, vy, vw, vh] = (root.getAttribute("viewBox") ?? "0 0 0 0")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBox = { x: vx ?? 0, y: vy ?? 0, width: vw ?? 0, height: vh ?? 0 };

  const errors: string[] = [];
  const seen = new Map<string, number>();
  const areaElements: { el: Element; area: ParsedArea }[] = [];
  const spaceElements: { el: Element; space: Omit<ParsedSpace, "areaSvgElementId"> }[] = [];

  for (const el of Array.from(root.querySelectorAll("[id]"))) {
    const id = el.getAttribute("id")!;
    if (!PREFIXES.some((p) => id.startsWith(p))) continue;
    seen.set(id, (seen.get(id) ?? 0) + 1);
    if (seen.get(id)! > 1) continue;

    let m: RegExpMatchArray | null;
    if ((m = id.match(AREA_ID))) {
      areaElements.push({
        el,
        area: { svgElementId: id, slug: m[1]!, name: titleFromSlug(m[1]!) },
      });
    } else if ((m = id.match(DESK_ID))) {
      const [, floor, number] = m;
      if (floor !== context.floorSlug) {
        errors.push(
          `${id} is numbered for floor "${floor}", but this is floor "${context.floorSlug}". Rename it desk-${context.floorSlug}-${number}.`,
        );
        continue;
      }
      spaceElements.push({
        el,
        space: {
          svgElementId: id,
          kind: "desk",
          name: deskCode(context.locationSlug, floor, number!),
        },
      });
    } else if ((m = id.match(ROOM_ID))) {
      const slug = m[1]!;
      const kind: SpaceKind = /^phone(-|$)/.test(slug) ? "phone_booth" : "meeting_room";
      spaceElements.push({ el, space: { svgElementId: id, kind, name: titleFromSlug(slug) } });
    } else if ((m = id.match(POI_ID))) {
      const [, poi, number] = m;
      spaceElements.push({
        el,
        space: {
          svgElementId: id,
          kind: POI_KINDS[poi!] ?? "other",
          name: titleFromSlug(number ? `${poi}-${number}` : poi!),
        },
      });
    } else {
      errors.push(
        `${id} doesn't follow the naming rules for its prefix (see the map authoring guide).`,
      );
    }
  }

  for (const [id, count] of seen) {
    if (count > 1) errors.push(`${id} is used ${count} times. Every id must be unique.`);
  }

  // Area membership: the nearest enclosing area group wins. A desk outside every group falls
  // back to the smallest area whose box contains its center.
  const areaByElement = new Map(areaElements.map(({ el, area }) => [el, area]));
  const areaBoxes = areaElements
    .map(({ el, area }) => ({ area, box: elementBounds(el, root) }))
    .filter((a): a is { area: ParsedArea; box: Box } => a.box !== null)
    .sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height);

  const spaces = spaceElements.map(({ el, space }) => {
    let areaSvgElementId: string | null = null;
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      const area = areaByElement.get(p);
      if (area) {
        areaSvgElementId = area.svgElementId;
        break;
      }
    }
    if (!areaSvgElementId) {
      const box = elementBounds(el, root);
      const point = box ? center(box) : null;
      areaSvgElementId = point
        ? (areaBoxes.find((a) => contains(a.box, point))?.area.svgElementId ?? null)
        : null;
    }
    return { ...space, areaSvgElementId };
  });

  return { viewBox, areas: areaElements.map((a) => a.area), spaces, errors };
}
