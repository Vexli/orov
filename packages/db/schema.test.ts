import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import journal from "./migrations/meta/_journal.json";
import { runMigrations } from "./migrate";
import { seedDemoData } from "./seed";
import * as s from "./schema";
import { startTestDatabase, type TestDatabase } from "./test-utils";

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

// Drizzle wraps driver errors ("Failed query: ..."), so the Postgres error code and constraint
// name live on `cause`. Assert on those instead of the message text.
async function expectUniqueViolation(promise: Promise<unknown>, constraint: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).not.toBeNull();
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
  expect(cause?.code).toBe("23505");
  expect(cause?.constraint).toBe(constraint);
}

async function expectCheckViolation(promise: Promise<unknown>, constraint: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  const cause = (error as { cause?: { code?: string; constraint?: string } } | null)?.cause;
  expect(cause?.code).toBe("23514");
  expect(cause?.constraint).toBe(constraint);
}

describe("migrations", () => {
  it("can be applied again without changing anything", async () => {
    await expect(runMigrations(t.url)).resolves.toBeUndefined();
    const rows = await t.db.execute(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
    expect(rows.rows[0]).toEqual({ n: journal.entries.length });
  });
});

describe("invariants enforced by the database", () => {
  it("accepts ISO 3166 country and subdivision codes, and rejects other shapes", async () => {
    const insert = (id: string, homeRegion: string) =>
      t.db.insert(s.person).values({ id, email: `${id}@x.com`, name: id, homeRegion });
    await insert("p_country", "US");
    await insert("p_subdivision", "GB-SCT");
    await insert("p_numeric", "FR-75C");
    for (const bad of ["us", "USA", "US-CALI", "US_CA", ""]) {
      await expectCheckViolation(insert(`p_${bad || "blank"}`, bad), "person_home_region_iso3166");
    }
    await expectCheckViolation(
      t.db.insert(s.location).values({ id: "loc_bad", slug: "bad", name: "Bad", timezone: "UTC", region: "U" }),
      "location_region_iso3166",
    );
  });

  it("allows one person per desk", async () => {
    await t.db
      .insert(s.location)
      .values({ id: "loc", slug: "x", name: "X", timezone: "UTC", region: "US-CA" });
    await t.db
      .insert(s.floor)
      .values({ id: "fl", locationId: "loc", slug: "1", name: "1", level: 1 });
    await t.db
      .insert(s.space)
      .values({
        id: "sp",
        floorId: "fl",
        kind: "desk",
        svgElementId: "desk-1-001",
        name: "D-1-001",
      });
    await t.db
      .insert(s.person)
      .values({ id: "p1", email: "a@x.com", name: "A", homeRegion: "US", assignedDeskId: "sp" });

    await expectUniqueViolation(
      t.db
        .insert(s.person)
        .values({ id: "p2", email: "b@x.com", name: "B", homeRegion: "US", assignedDeskId: "sp" }),
      "person_assigned_desk",
    );
  });

  it("allows many people with no desk", async () => {
    await t.db.insert(s.person).values([
      { id: "p1", email: "a@x.com", name: "A", homeRegion: "US" },
      { id: "p2", email: "b@x.com", name: "B", homeRegion: "US" },
    ]);
    const rows = await t.db.select().from(s.person);
    expect(rows).toHaveLength(2);
  });

  it("allows at most one primary team per person", async () => {
    await seedDemoData(t.db);
    // Bob's primary team is already payroll, so a second primary membership must fail.
    await expectUniqueViolation(
      t.db
        .insert(s.teamMember)
        .values({ personId: "p_bob", teamId: "t_recruiting", isPrimary: true }),
      "team_member_one_primary",
    );
  });

  it("rejects a second signal with the same source, source_ref and date", async () => {
    await seedDemoData(t.db);
    const signal = {
      id: "sig_1",
      personId: "p_bob",
      date: "2026-10-05",
      status: "wfh" as const,
      source: "slack_message" as const,
      sourceRef: "1728000000.000100",
      observedAt: new Date("2026-10-05T08:00:00Z"),
    };
    await t.db.insert(s.presenceSignal).values(signal);
    await expectUniqueViolation(
      t.db.insert(s.presenceSignal).values({ ...signal, id: "sig_2" }),
      "presence_signal_source",
    );
  });

  it("requires unique desk codes, but lets rooms share a name across floors", async () => {
    await seedDemoData(t.db);
    await t.db
      .insert(s.floor)
      .values({ id: "fl_b", locationId: "loc_sf", slug: "3", name: "Floor 3", level: 3 });

    // Two meeting rooms named "Boardroom" on different floors are allowed.
    await t.db
      .insert(s.space)
      .values({
        id: "sp_b2",
        floorId: "fl_b",
        kind: "meeting_room",
        svgElementId: "room-boardroom",
        name: "Boardroom",
      });

    // Two desks with the same code are not.
    await expectUniqueViolation(
      t.db
        .insert(s.space)
        .values({
          id: "sp_dup",
          floorId: "fl_b",
          kind: "desk",
          svgElementId: "desk-3-014",
          name: "SF-2-014",
        }),
      "space_desk_name",
    );
  });

  it("cascades a person's team memberships when the person is deleted", async () => {
    await seedDemoData(t.db);
    await t.db.delete(s.person).where(eq(s.person.id, "p_bob"));
    const rows = await t.db.select().from(s.teamMember).where(eq(s.teamMember.personId, "p_bob"));
    expect(rows).toEqual([]);
  });
});

describe("demo seed", () => {
  it("loads Bob → Max → Jane with the expected desks and teams", async () => {
    await seedDemoData(t.db);

    const bob = await t.db.query.person.findFirst({
      where: eq(s.person.id, "p_bob"),
      with: {
        manager: { with: { manager: true } },
        assignedDesk: { with: { floor: { with: { location: true } } } },
      },
    });
    expect(bob?.manager?.name).toBe("Max Osei");
    expect(bob?.manager?.manager?.name).toBe("Jane Park");
    expect(bob?.assignedDesk?.name).toBe("SF-2-014");
    expect(bob?.assignedDesk?.floor.location.name).toBe("San Francisco");

    const jane = await t.db.query.person.findFirst({ where: eq(s.person.id, "p_jane") });
    expect(jane).toMatchObject({ homeRegion: "CA-ON", managerId: null });
    expect(jane?.assignedDeskId).toBe("sp_sf_2_003");

    const hrChildren = await t.db.query.team.findMany({
      where: eq(s.team.parentTeamId, "t_hr"),
      orderBy: s.team.slug,
    });
    expect(hrChildren.map((c) => c.slug)).toEqual(["payroll", "recruiting"]);

    const floor = await t.db.query.floor.findFirst({ where: eq(s.floor.id, "fl_sf_2") });
    expect(floor?.svgAssetId).toBe("svg_sf_2_v1");
  });
});
