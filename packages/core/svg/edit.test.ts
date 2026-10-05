import { describe, expect, it } from "vitest";
import { DrawingEditError, editDrawing, slugFromName } from "./edit";
import { parseFloorSvg } from "./parse";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600">
  <g id="area-north"><rect x="0" y="0" width="500" height="600" fill="none"/>
    <rect id="desk-2-001" x="10" y="10" width="90" height="56"/>
    <rect id="desk-2-014" x="10" y="100" width="90" height="56"/>
  </g>
  <rect id="room-boardroom" x="600" y="10" width="300" height="200"/>
</svg>`;
const context = { floorSlug: "2", locationSlug: "sf" };

describe("editDrawing", () => {
  it("adds a desk numbered after the highest one, which the parser places in its area", () => {
    const { svg, svgElementId } = editDrawing(SVG, "2", { kind: "addDesk", rect: { x: 200, y: 300, width: 90, height: 56 } });
    expect(svgElementId).toBe("desk-2-015");
    const desk = parseFloorSvg(svg, context).spaces.find((s) => s.svgElementId === "desk-2-015");
    expect(desk).toMatchObject({ kind: "desk", areaSvgElementId: "area-north" });
  });

  it("adds a room named after its slug, and never reuses an id", () => {
    const first = editDrawing(SVG, "2", { kind: "addRoom", name: "Café Bleu", rect: { x: 600, y: 300, width: 200, height: 150 } });
    expect(first.svgElementId).toBe("room-cafe-bleu");
    expect(parseFloorSvg(first.svg, context).spaces.find((s) => s.svgElementId === "room-cafe-bleu")).toMatchObject({
      kind: "meeting_room",
      name: "Cafe Bleu",
    });
    const again = editDrawing(SVG, "2", { kind: "addRoom", name: "Boardroom", rect: { x: 600, y: 300, width: 200, height: 150 } });
    expect(again.svgElementId).toBe("room-boardroom-2");
  });

  it("removes a desk or room", () => {
    const { svg } = editDrawing(SVG, "2", { kind: "remove", svgElementId: "desk-2-014" });
    expect(parseFloorSvg(svg, context).spaces.map((s) => s.svgElementId)).toEqual(["desk-2-001", "room-boardroom"]);
  });

  it.each([
    [{ kind: "addDesk", rect: { x: 990, y: 10, width: 90, height: 56 } }, /inside the drawing/],
    [{ kind: "addDesk", rect: { x: 10, y: 10, width: 1, height: 1 } }, /bigger/],
    [{ kind: "addRoom", name: "!!!", rect: { x: 10, y: 10, width: 90, height: 90 } }, /at least one letter/],
    [{ kind: "remove", svgElementId: "area-north" }, /Only desks and rooms/],
    [{ kind: "remove", svgElementId: "desk-2-999" }, /isn't in the drawing/],
  ] as const)("refuses %j", (edit, message) => {
    expect(() => editDrawing(SVG, "2", edit)).toThrow(DrawingEditError);
    expect(() => editDrawing(SVG, "2", edit)).toThrow(message);
  });
});

describe("slugFromName", () => {
  it.each([
    ["Fjord", "fjord"],
    ["Phone 3", "phone-3"],
    ["  Café  Bleu! ", "cafe-bleu"],
  ])("%j → %j", (name, slug) => {
    expect(slugFromName(name)).toBe(slug);
  });
});
