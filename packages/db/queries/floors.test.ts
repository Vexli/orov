import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { hasChanges } from "@officeorg/core";
import { seedDemoData } from "../seed";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { listAudit } from "./audit";
import { ValidationError } from "./errors";
import {
  applyFloorUpload,
  getFloorForAdmin,
  previewFloorRollback,
  previewFloorUpload,
  listFloorSpacesForAdmin,
  previewDrawingEdit,
  rollbackFloor,
  saveArea,
  saveFloor,
  saveLocation,
  saveSpace,
} from "./floors";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await t.reset();
  await seedDemoData(t.db);
});

const ACTOR = "jane@example.com";
const FLOOR_2 = readFileSync(new URL("../seed-floors/sf-2.svg", import.meta.url), "utf8");
const NO = { confirmDeskless: false };

const spaceBySvg = (floorId: string, svgElementId: string) =>
  t.db.query.space.findFirst({
    where: and(eq(s.space.floorId, floorId), eq(s.space.svgElementId, svgElementId)),
  });

describe("the seeded floors", () => {
  it.each(["fl_sf_2", "fl_sf_3"])("%s matches its own drawing exactly", async (floorId) => {
    const floor = await t.db.query.floor.findFirst({
      where: eq(s.floor.id, floorId),
      with: { location: true },
    });
    const asset = await t.db.query.svgAsset.findFirst({
      where: eq(s.svgAsset.id, floor!.svgAssetId!),
    });
    const preview = await previewFloorUpload(t.db, floorId, asset!.sanitizedSvg);
    expect(preview.diff.errors).toEqual([]);
    expect(hasChanges(preview.diff)).toBe(false);
  });
});

describe("uploading a drawing", () => {
  it("adds desks and areas as a new version, and records it", async () => {
    const svg = FLOOR_2.replace(
      "</svg>",
      '<g id="area-east-nook"><rect x="900" y="660" width="260" height="100"/><rect id="desk-2-020" x="920" y="680" width="90" height="56"/></g></svg>',
    );
    const preview = await previewFloorUpload(t.db, "fl_sf_2", svg);
    expect(preview.diff.areas.added.map((a) => a.svgElementId)).toEqual(["area-east-nook"]);
    expect(preview.diff.spaces.added.map((sp) => sp.name)).toEqual(["SF-2-020"]);

    const result = await applyFloorUpload(t.db, ACTOR, "fl_sf_2", svg, NO);
    expect(result.version).toBe(2);

    const desk = await spaceBySvg("fl_sf_2", "desk-2-020");
    const area = await t.db.query.area.findFirst({
      where: eq(s.area.svgElementId, "area-east-nook"),
    });
    expect(desk).toMatchObject({
      kind: "desk",
      name: "SF-2-020",
      areaId: area!.id,
      archivedAt: null,
    });
    expect(area).toMatchObject({ slug: "east-nook", name: "East Nook" });

    const floor = await getFloorForAdmin(t.db, "fl_sf_2");
    expect(floor!.svgAssetId).toBe(result.svgAssetId);
    expect(floor!.versions.map((v) => v.version)).toEqual([2, 1]);

    const [entry] = await listAudit(t.db, { entity: "floor" });
    expect(entry).toMatchObject({ entityId: "fl_sf_2", actorEmail: ACTOR, before: { version: 1 } });
    expect(entry!.after).toMatchObject({ version: 2, how: "upload", spacesAdded: ["desk-2-020"] });
  });

  it("stores the sanitized drawing, not the upload", async () => {
    const svg = FLOOR_2.replace(
      "</svg>",
      '<script>alert(1)</script><rect id="desk-2-021" onclick="x()"/></svg>',
    );
    const { svgAssetId } = await applyFloorUpload(t.db, ACTOR, "fl_sf_2", svg, NO);
    const asset = await t.db.query.svgAsset.findFirst({ where: eq(s.svgAsset.id, svgAssetId) });
    expect(asset!.sanitizedSvg).not.toMatch(/script|onclick/);
    expect(asset!.sanitizedSvg).toContain('id="desk-2-021"');
  });

  it("archives a removed desk nobody holds, and restores the same row when it comes back", async () => {
    const without = FLOOR_2.replace(/<rect id="desk-2-016"[^>]*\/>/, "");
    await applyFloorUpload(t.db, ACTOR, "fl_sf_2", without, NO);
    expect((await spaceBySvg("fl_sf_2", "desk-2-016"))?.archivedAt).toBeInstanceOf(Date);

    const preview = await previewFloorUpload(t.db, "fl_sf_2", FLOOR_2);
    expect(preview.diff.spaces.added).toEqual([
      expect.objectContaining({ svgElementId: "desk-2-016", restoreId: "sp_sf_2_016" }),
    ]);

    // Same bytes as version 1, but a new upload is still a new version.
    await applyFloorUpload(t.db, ACTOR, "fl_sf_2", FLOOR_2, NO);
    const restored = await spaceBySvg("fl_sf_2", "desk-2-016");
    expect(restored).toMatchObject({
      id: "sp_sf_2_016",
      archivedAt: null,
      areaId: "area_north_wing",
    });
  });

  it("won't remove a desk someone holds until the admin confirms they become deskless", async () => {
    const without = FLOOR_2.replace(/<rect id="desk-2-014"[^>]*\/>/, "");
    const preview = await previewFloorUpload(t.db, "fl_sf_2", without);
    expect(preview.diff.spaces.removedAssigned).toEqual([
      expect.objectContaining({
        id: "sp_sf_2_014",
        assignedTo: { personId: "p_bob", name: "Bob Lindqvist" },
      }),
    ]);

    await expect(applyFloorUpload(t.db, ACTOR, "fl_sf_2", without, NO)).rejects.toThrow(
      /Bob Lindqvist \(SF-2-014\)/,
    );
    expect((await spaceBySvg("fl_sf_2", "desk-2-014"))?.archivedAt).toBeNull();

    await applyFloorUpload(t.db, ACTOR, "fl_sf_2", without, { confirmDeskless: true });
    const bob = await t.db.query.person.findFirst({ where: eq(s.person.id, "p_bob") });
    expect(bob?.assignedDeskId).toBeNull();
    expect((await spaceBySvg("fl_sf_2", "desk-2-014"))?.archivedAt).toBeInstanceOf(Date);

    const personEntry = (await listAudit(t.db, { entity: "person" }))[0];
    expect(personEntry).toMatchObject({
      entityId: "p_bob",
      before: { deskCode: "SF-2-014" },
      after: { deskCode: null },
    });
  });

  it("moves spaces when areas change, and deletes an area the drawing drops", async () => {
    // Unwrap the South Wing group: its desks are now outside any area by nesting, and its box
    // is gone, so the position fallback finds nothing either.
    const svg = FLOOR_2.replace('<g id="area-south-wing">', "<g>");
    const preview = await previewFloorUpload(t.db, "fl_sf_2", svg);
    expect(preview.diff.areas.removed.map((a) => a.id)).toEqual(["area_south_wing"]);
    expect(preview.diff.spaces.moved).toHaveLength(7);

    await applyFloorUpload(t.db, ACTOR, "fl_sf_2", svg, NO);
    expect(
      await t.db.query.area.findFirst({ where: eq(s.area.id, "area_south_wing") }),
    ).toBeUndefined();
    expect((await spaceBySvg("fl_sf_2", "desk-2-003"))?.areaId).toBeNull();
  });

  it.each([
    [
      "a desk numbered for another floor",
      FLOOR_2.replace('id="desk-2-001"', 'id="desk-3-001"'),
      /numbered for floor "3"/,
    ],
    ["a duplicate id", FLOOR_2.replace('id="desk-2-002"', 'id="desk-2-001"'), /used 2 times/],
    ["the current drawing again", FLOOR_2, /same as the current version/],
    ["something that isn't SVG", "<html></html>", /isn't an SVG/],
  ])("rejects %s", async (_, svg, message) => {
    const attempt = applyFloorUpload(t.db, ACTOR, "fl_sf_2", svg, NO);
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(applyFloorUpload(t.db, ACTOR, "fl_sf_2", svg, NO)).rejects.toThrow(message);
    expect((await getFloorForAdmin(t.db, "fl_sf_2"))!.versions).toHaveLength(1);
  });
});

describe("rolling back", () => {
  it("makes an earlier version current again, with the same diff rules", async () => {
    const svg = FLOOR_2.replace(
      "</svg>",
      '<rect id="desk-2-030" x="1000" y="700" width="20" height="20"/></svg>',
    );
    await applyFloorUpload(t.db, ACTOR, "fl_sf_2", svg, NO);

    const preview = await previewFloorRollback(t.db, "fl_sf_2", "svg_sf_2_v1");
    expect(preview.diff.spaces.removedUnassigned.map((sp) => sp.svgElementId)).toEqual([
      "desk-2-030",
    ]);

    const result = await rollbackFloor(t.db, ACTOR, "fl_sf_2", "svg_sf_2_v1", NO);
    expect(result).toEqual({ version: 1, svgAssetId: "svg_sf_2_v1" });

    const floor = await getFloorForAdmin(t.db, "fl_sf_2");
    expect(floor!.svgAssetId).toBe("svg_sf_2_v1");
    // History is kept: version 2 is still there to roll forward to.
    expect(floor!.versions.map((v) => v.version)).toEqual([2, 1]);
    expect((await spaceBySvg("fl_sf_2", "desk-2-030"))?.archivedAt).toBeInstanceOf(Date);
    expect((await listAudit(t.db, { entity: "floor" }))[0]!.after).toMatchObject({
      how: "rollback",
      version: 1,
    });
  });

  it("rejects the current version and another floor's version", async () => {
    await expect(rollbackFloor(t.db, ACTOR, "fl_sf_2", "svg_sf_2_v1", NO)).rejects.toThrow(
      /already current/,
    );
    await expect(rollbackFloor(t.db, ACTOR, "fl_sf_2", "svg_sf_3_v1", NO)).rejects.toThrow(
      /no longer exists/,
    );
  });
});

describe("offices and floors", () => {
  const office = {
    slug: "nyc",
    name: "New York",
    timezone: "America/New_York",
    region: "US-NY",
    sortOrder: 2,
    floorLabelSingular: "Floor",
    floorLabelPlural: "Floors",
  };
  const floor = { slug: "4", name: "Floor 4", level: 4, sortOrder: 4 };

  it("creates an office and a floor, and audits both", async () => {
    const { id: locationId } = await saveLocation(t.db, ACTOR, office);
    const { id: floorId } = await saveFloor(t.db, ACTOR, locationId, floor);
    const saved = await getFloorForAdmin(t.db, floorId);
    expect(saved).toMatchObject({
      slug: "4",
      location: { slug: "nyc" },
      svgAssetId: null,
      versions: [],
    });
    const entities = (await listAudit(t.db)).map((e) => e.entity);
    expect(entities).toEqual(expect.arrayContaining(["location", "floor"]));
  });

  it("rejects duplicate slugs", async () => {
    await expect(saveLocation(t.db, ACTOR, { ...office, slug: "sf" })).rejects.toThrow(
      /already uses this slug/,
    );
    await expect(saveFloor(t.db, ACTOR, "loc_sf", { ...floor, slug: "2" })).rejects.toThrow(
      /already has a floor/,
    );
  });

  it("locks slugs that desk codes and desk ids depend on", async () => {
    const sf = await t.db.query.location.findFirst({ where: eq(s.location.id, "loc_sf") });
    await expect(
      saveLocation(
        t.db,
        ACTOR,
        { ...office, slug: "sfo", name: sf!.name, timezone: sf!.timezone, region: sf!.region, sortOrder: 1 },
        "loc_sf",
      ),
    ).rejects.toThrow(/desk codes use it/);
    await expect(
      saveFloor(t.db, ACTOR, "loc_sf", { ...floor, slug: "two" }, "fl_sf_2"),
    ).rejects.toThrow(/desk ids use it/);
    // Renaming is fine.
    await saveFloor(
      t.db,
      ACTOR,
      "loc_sf",
      { slug: "2", name: "Second floor", level: 2, sortOrder: 2 },
      "fl_sf_2",
    );
    expect((await getFloorForAdmin(t.db, "fl_sf_2"))!.name).toBe("Second floor");
  });
});

describe("renaming rooms and areas", () => {
  it("renames a room and sets its capacity, audited, and a re-upload keeps the name", async () => {
    await saveSpace(t.db, ACTOR, "sp_huddle_a", { name: "Fjord", capacity: 6 });
    const room = await t.db.query.space.findFirst({ where: eq(s.space.id, "sp_huddle_a") });
    expect(room).toMatchObject({ name: "Fjord", capacity: 6 });
    expect((await listAudit(t.db, { entity: "space" }))[0]).toMatchObject({ entityId: "sp_huddle_a", action: "update" });

    // The drawing still says room-huddle-a; uploading it again doesn't bring "Huddle A" back.
    await applyFloorUpload(t.db, ACTOR, "fl_sf_2", FLOOR_2.replace("</svg>", `<circle cx="5" cy="5" r="2" fill="currentColor"/></svg>`), NO);
    expect((await t.db.query.space.findFirst({ where: eq(s.space.id, "sp_huddle_a") }))?.name).toBe("Fjord");
  });

  it("renames an area", async () => {
    await saveArea(t.db, ACTOR, "area_south_wing", { name: "Fjord Wing" });
    const { areas } = await listFloorSpacesForAdmin(t.db, "fl_sf_2");
    expect(areas.map((a) => a.name)).toContain("Fjord Wing");
  });

  it("won't rename a desk, whose name is its code", async () => {
    await expect(saveSpace(t.db, ACTOR, "sp_sf_2_014", { name: "Bob's desk", capacity: null })).rejects.toThrow(
      /can't be renamed/,
    );
  });

  it("lists rooms and points of interest but not desks", async () => {
    const { spaces } = await listFloorSpacesForAdmin(t.db, "fl_sf_2");
    expect(spaces.some((sp) => sp.kind === "desk")).toBe(false);
    expect(spaces.map((sp) => sp.name)).toContain("Boardroom");
  });
});

describe("editing the drawing in the browser", () => {
  it("places a desk as a new version, ready to assign", async () => {
    const preview = await previewDrawingEdit(t.db, "fl_sf_2", null, {
      kind: "addDesk",
      rect: { x: 400, y: 600, width: 90, height: 56 },
    });
    expect(preview.svgElementId).toBe("desk-2-017");
    expect(preview.diff.spaces.added.map((a) => a.svgElementId)).toEqual(["desk-2-017"]);

    const { version } = await applyFloorUpload(t.db, ACTOR, "fl_sf_2", preview.svg, NO);
    expect(version).toBe(2);
    const desk = await t.db.query.space.findFirst({ where: eq(s.space.svgElementId, "desk-2-017") });
    expect(desk).toMatchObject({ kind: "desk", name: "SF-2-017", archivedAt: null });
  });

  it("stacks edits on a drawing that hasn't been applied yet", async () => {
    const first = await previewDrawingEdit(t.db, "fl_sf_2", null, {
      kind: "addRoom",
      name: "Fjord",
      rect: { x: 400, y: 600, width: 120, height: 100 },
    });
    const second = await previewDrawingEdit(t.db, "fl_sf_2", first.svg, { kind: "remove", svgElementId: "desk-2-014" });
    expect(second.diff.spaces.added.map((a) => a.svgElementId)).toEqual(["room-fjord"]);
    // Bob sits at SF-2-014, so removing it needs the admin's confirmation, as with an upload.
    expect(second.diff.spaces.removedAssigned.map((r) => r.svgElementId)).toEqual(["desk-2-014"]);
  });
});
