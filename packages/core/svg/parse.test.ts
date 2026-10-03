import { describe, expect, it } from "vitest";
import { deskCode, parseFloorSvg, titleFromSlug } from "./parse";

const context = { floorSlug: "2", locationSlug: "sf" };
const svg = (body: string) => `<svg viewBox="0 0 1000 800">${body}</svg>`;

describe("parseFloorSvg", () => {
  it("reads areas, desks, rooms and points of interest, and ignores decoration", () => {
    const parsed = parseFloorSvg(
      svg(`
        <rect id="outline" width="1000" height="800"/>
        <g id="area-south-wing">
          <rect x="0" y="400" width="500" height="400"/>
          <rect id="desk-2-003" x="10" y="410" width="20" height="20"/>
          <rect id="room-huddle-a" x="100" y="410" width="80" height="80"/>
        </g>
        <rect id="room-phone-1" x="600" y="10" width="20" height="20"/>
        <rect id="room-boardroom" x="700" y="10" width="200" height="100"/>
        <rect id="poi-kitchen" x="700" y="200" width="50" height="50"/>
        <rect id="poi-restroom-2" x="800" y="200" width="50" height="50"/>
        <rect id="poi-lockers" x="900" y="200" width="50" height="50"/>
      `),
      context,
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.viewBox).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(parsed.areas).toEqual([
      { svgElementId: "area-south-wing", slug: "south-wing", name: "South Wing" },
    ]);
    expect(parsed.spaces).toEqual([
      {
        svgElementId: "desk-2-003",
        kind: "desk",
        name: "SF-2-003",
        areaSvgElementId: "area-south-wing",
      },
      {
        svgElementId: "room-huddle-a",
        kind: "meeting_room",
        name: "Huddle A",
        areaSvgElementId: "area-south-wing",
      },
      {
        svgElementId: "room-phone-1",
        kind: "phone_booth",
        name: "Phone 1",
        areaSvgElementId: null,
      },
      {
        svgElementId: "room-boardroom",
        kind: "meeting_room",
        name: "Boardroom",
        areaSvgElementId: null,
      },
      { svgElementId: "poi-kitchen", kind: "kitchen", name: "Kitchen", areaSvgElementId: null },
      {
        svgElementId: "poi-restroom-2",
        kind: "restroom",
        name: "Restroom 2",
        areaSvgElementId: null,
      },
      { svgElementId: "poi-lockers", kind: "other", name: "Lockers", areaSvgElementId: null },
    ]);
  });

  it("places a desk outside every group in the area whose box holds its center", () => {
    const parsed = parseFloorSvg(
      svg(`
        <rect id="area-north" x="0" y="0" width="500" height="400"/>
        <rect id="area-nook" x="0" y="0" width="100" height="100"/>
        <rect id="desk-2-001" x="200" y="200" width="20" height="20"/>
        <rect id="desk-2-002" x="10" y="10" width="20" height="20"/>
        <g transform="translate(600 0)"><rect id="desk-2-003" x="0" y="0" width="20" height="20"/></g>
      `),
      context,
    );
    const areaOf = (id: string) =>
      parsed.spaces.find((s) => s.svgElementId === id)?.areaSvgElementId;
    expect(areaOf("desk-2-001")).toBe("area-north");
    // Inside both boxes: the smaller, more specific area wins.
    expect(areaOf("desk-2-002")).toBe("area-nook");
    // The transform moves it outside every area.
    expect(areaOf("desk-2-003")).toBeNull();
  });

  it("prefers nesting over position", () => {
    const parsed = parseFloorSvg(
      svg(`
        <rect id="area-a" x="0" y="0" width="100" height="100"/>
        <g id="area-b"><rect x="500" y="500" width="10" height="10"/><rect id="desk-2-001" x="10" y="10" width="5" height="5"/></g>
      `),
      context,
    );
    expect(parsed.spaces[0]!.areaSvgElementId).toBe("area-b");
  });

  it("accepts a multi-part floor slug in desk ids", () => {
    const parsed = parseFloorSvg(svg('<rect id="desk-2-east-014"/>'), {
      floorSlug: "2-east",
      locationSlug: "nyc",
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.spaces[0]!.name).toBe("NYC-2-EAST-014");
  });

  it.each([
    [
      "a desk numbered for another floor",
      '<rect id="desk-3-001"/>',
      /numbered for floor "3".*desk-2-001/,
    ],
    [
      "a duplicate id",
      '<rect id="desk-2-001"/><rect id="desk-2-001"/>',
      /desk-2-001 is used 2 times/,
    ],
    [
      "an id that breaks the rules",
      '<rect id="room-Board_Room"/>',
      /room-Board_Room doesn't follow/,
    ],
    ["a desk without a number", '<rect id="desk-2-a"/>', /desk-2-a doesn't follow/],
  ])("reports %s", (_, body, message) => {
    const parsed = parseFloorSvg(svg(body), context);
    expect(parsed.errors.join("\n")).toMatch(message);
  });

  it("reports a missing svg element", () => {
    expect(parseFloorSvg("<div></div>", context).errors).toEqual([
      "The drawing has no <svg> element.",
    ]);
  });
});

describe("names", () => {
  it.each([
    ["south-wing", "South Wing"],
    ["huddle-a", "Huddle A"],
    ["phone-1", "Phone 1"],
  ])("%s → %s", (slug, title) => {
    expect(titleFromSlug(slug)).toBe(title);
  });

  it("builds desk codes in upper case", () => {
    expect(deskCode("sf", "2", "014")).toBe("SF-2-014");
  });
});
