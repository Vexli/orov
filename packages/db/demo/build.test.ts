import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNotNull } from "drizzle-orm";
import { diffFloor, hasChanges } from "@orov/core";
import { parseFloorSvg } from "@orov/core/svg/parse";
import { exportOrganization } from "../queries/backup";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { buildDemoOrganization } from "./build";
import { loadDemo, readDemoExport } from "./file";

let t: TestDatabase;

beforeAll(async () => {
  t = await startTestDatabase();
}, 180_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(async () => {
  await t.reset();
});

describe("buildDemoOrganization", () => {
  it("builds the same organization every time", async () => {
    await buildDemoOrganization(t.db);
    const first = (await exportOrganization(t.db, "demo")).data;
    await t.reset();
    await buildDemoOrganization(t.db);
    const second = (await exportOrganization(t.db, "demo")).data;
    // Timestamps differ between builds; everything else is fixed by the seed.
    const strip = (rows: Record<string, unknown>[]) =>
      rows.map(({ createdAt: _c, updatedAt: _u, uploadedAt: _a, ...rest }) => rest);
    expect(strip(second.people)).toEqual(strip(first.people));
    expect(strip(second.spaces)).toEqual(strip(first.spaces));
  });

  it("stores every floor exactly as an upload of its drawing would", async () => {
    await buildDemoOrganization(t.db);
    const floors = await t.db
      .select({ floor: s.floor, location: s.location, svg: s.svgAsset.sanitizedSvg })
      .from(s.floor)
      .innerJoin(s.location, eq(s.floor.locationId, s.location.id))
      .innerJoin(s.svgAsset, eq(s.floor.svgAssetId, s.svgAsset.id));
    expect(floors).toHaveLength(6);
    for (const { floor, location, svg } of floors) {
      const parsed = parseFloorSvg(svg, { floorSlug: floor.slug, locationSlug: location.slug });
      const [areas, spaces] = await Promise.all([
        t.db.select().from(s.area).where(eq(s.area.floorId, floor.id)),
        t.db.select().from(s.space).where(eq(s.space.floorId, floor.id)),
      ]);
      const diff = diffFloor(parsed, {
        areas,
        spaces: spaces.map((sp) => ({ ...sp, archived: sp.archivedAt !== null, assignedTo: null })),
      });
      expect(hasChanges(diff), `${floor.id} differs from its drawing`).toBe(false);
    }
  });

  it("seats active people only, at desks, and leaves desks free", async () => {
    await buildDemoOrganization(t.db);
    const seated = await t.db
      .select({ active: s.person.active, kind: s.space.kind })
      .from(s.person)
      .innerJoin(s.space, eq(s.person.assignedDeskId, s.space.id));
    expect(seated.every((r) => r.active && r.kind === "desk")).toBe(true);
    const desks = await t.db.select().from(s.space).where(eq(s.space.kind, "desk"));
    expect(seated.length).toBeLessThan(desks.length);
    const deskless = await t.db
      .select()
      .from(s.person)
      .where(and(isNotNull(s.person.officeId), eq(s.person.active, true)));
    expect(deskless.length).toBeGreaterThan(0);
  });
});

describe("the committed demo file", () => {
  it("loads into an instance through the backup import, roles included", async () => {
    await loadDemo(t.db, "seed");
    const exported = JSON.parse(readDemoExport()) as { meta: { counts: Record<string, number> } };
    const people = await t.db.select().from(s.person);
    expect(people).toHaveLength(exported.meta.counts.people!);
    const admins = await t.db.select().from(s.appUser).where(eq(s.appUser.role, "admin"));
    expect(admins.length).toBeGreaterThan(0);
    const [theme] = await t.db.select().from(s.theme).where(eq(s.theme.active, true));
    expect(theme).toBeDefined();
  });
});
