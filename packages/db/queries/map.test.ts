import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { seedTestFixture } from "../test-fixture";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { setLocationMapTheme } from "./floors";
import { loadMap } from "./map";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await t.reset();
  await seedTestFixture(t.db);
});

describe("loadMap", () => {
  it("opens the floor the URL names, with its drawing, areas and live spaces", async () => {
    const map = await loadMap(t.db, { loc: "sf", floor: "3" });
    expect(map.floor).toMatchObject({
      id: "fl_sf_3",
      slug: "3",
      locationSlug: "sf",
      assetId: "svg_sf_3_v1",
    });
    expect(map.floor!.svg).toContain('id="desk-3-001"');
    expect(map.floor!.areas.map((a) => a.slug)).toEqual(["west-wing"]);
    expect(map.floor!.spaces.find((sp) => sp.svgElementId === "room-workshop")).toMatchObject({
      kind: "meeting_room",
      capacity: 20,
    });
  });

  it.each([
    ["no params", { loc: null, floor: null }],
    ["an unknown floor", { loc: "sf", floor: "99" }],
    ["an unknown office", { loc: "zz", floor: "2" }],
  ])("falls back to the first floor with a drawing for %s", async (_, target) => {
    expect((await loadMap(t.db, target)).floor?.id).toBe("fl_sf_2");
  });

  it("opens a focused person's floor, even when the URL names another", async () => {
    expect((await loadMap(t.db, { loc: "sf", floor: "2", person: "p_sam" })).floor?.id).toBe("fl_sf_3");
    // Without a desk there is nothing to follow, so the URL's floor stands.
    expect((await loadMap(t.db, { loc: "sf", floor: "3", person: "p_priya" })).floor?.id).toBe("fl_sf_3");
  });

  it("lists offices and floors for navigation, with regions in the viewer's style", async () => {
    const map = await loadMap(t.db, { loc: null, floor: null }, { display: "code", flag: true });
    expect(map.locations).toEqual([
      {
        slug: "sf",
        name: "San Francisco",
        regionLabel: "US-CA",
        regionFlag: "🇺🇸",
        regionFlagOnly: false,
        floorLabels: { singular: "Floor", plural: "Floors" },
        floors: [
          { slug: "2", name: "Floor 2", level: 2, hasDrawing: true, deskCount: 13, roomCount: 3 },
          { slug: "3", name: "Floor 3", level: 3, hasDrawing: true, deskCount: 8, roomCount: 2 },
        ],
      },
    ]);
  });

  it("loads every active person's seat on every floor", async () => {
    const map = await loadMap(t.db, { loc: "sf", floor: "2" });
    expect(map.seats.map((seat) => [seat.personId, seat.deskName, seat.areaSlug])).toEqual([
      ["p_jane", "SF-2-003", "south-wing"],
      ["p_max", "SF-2-010", "north-wing"],
      ["p_bob", "SF-2-014", "north-wing"],
      ["p_sam", "SF-3-001", "west-wing"],
    ]);
  });

  it("leaves out archived spaces and deactivated people", async () => {
    await t.db.update(s.space).set({ archivedAt: new Date() }).where(eq(s.space.id, "sp_sf_2_016"));
    await t.db.update(s.person).set({ active: false }).where(eq(s.person.id, "p_bob"));
    const map = await loadMap(t.db, { loc: "sf", floor: "2" });
    expect(map.floor!.spaces.some((sp) => sp.id === "sp_sf_2_016")).toBe(false);
    expect(map.seats.some((seat) => seat.personId === "p_bob")).toBe(false);
  });

  it("returns no floor when nothing has a drawing yet", async () => {
    await t.db.update(s.floor).set({ svgAssetId: null });
    const map = await loadMap(t.db, { loc: null, floor: null });
    expect(map.floor).toBeNull();
    expect(map.locations[0]!.floors.every((f) => !f.hasDrawing)).toBe(true);
  });
});

describe("an office's own map colors", () => {
  it("are saved with an audit entry, sent with the office's floors, and cleared with null", async () => {
    const override = { light: { "map.selection": "#7c3aed" }, dark: {} };
    await setLocationMapTheme(t.db, "jane@example.com", "loc_sf", override);

    const map = await loadMap(t.db, { loc: "sf", floor: "2" });
    expect(map.floor).toMatchObject({ locationId: "loc_sf", locationTheme: override });
    const [entry] = await t.db.select().from(s.auditLog).where(eq(s.auditLog.entityId, "loc_sf"));
    expect(entry).toMatchObject({
      entity: "location",
      action: "update",
      before: { mapTheme: null },
      after: { mapTheme: override },
    });

    await setLocationMapTheme(t.db, "jane@example.com", "loc_sf", null);
    expect((await loadMap(t.db, { loc: "sf", floor: "2" })).floor!.locationTheme).toBeNull();
  });
});
