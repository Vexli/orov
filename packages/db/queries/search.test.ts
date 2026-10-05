import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { seedDemoData } from "../seed";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { search } from "./search";

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

describe("search", () => {
  it("finds a person by part of their name, with their title and desk", async () => {
    const results = await search(t.db, "lindq");
    expect(results.people).toEqual([
      { id: "p_bob", name: "Bob Lindqvist", title: "Payroll Analyst", desk: "SF-2-014" },
    ]);
  });

  it("matches the full name built from the given and family names", async () => {
    expect((await search(t.db, "Lindqvist")).people.map((p) => p.id)).toEqual(["p_bob"]);
    expect((await search(t.db, "Bob L")).people.map((p) => p.id)).toEqual(["p_bob"]);
    // A name change shows up straight away, since the database keeps the full name in step.
    await t.db.update(s.person).set({ familyName: "Lind" }).where(eq(s.person.id, "p_bob"));
    expect((await search(t.db, "Bob Lind")).people[0]).toMatchObject({ id: "p_bob", name: "Bob Lind" });
  });

  it("forgives a typo through pg_trgm", async () => {
    expect((await search(t.db, "lindqvst")).people.map((p) => p.id)).toEqual(["p_bob"]);
    expect((await search(t.db, "recruting")).teams.map((t) => t.id)).toEqual(["t_recruiting"]);
    expect((await search(t.db, "worksop")).rooms.map((r) => r.id)).toEqual(["sp_workshop"]);
  });

  it("ranks names that start with the query first", async () => {
    // "sa" is inside "Sam" and fuzzily close to others; Sam starts with it.
    const results = await search(t.db, "sa");
    expect(results.people[0]?.id).toBe("p_sam");
  });

  it("finds people by email and title, and leaves out inactive people", async () => {
    expect((await search(t.db, "recruiter")).people.map((p) => p.id).sort()).toEqual([
      "p_priya",
      "p_sam",
    ]);
    await t.db.update(s.person).set({ active: false }).where(eq(s.person.id, "p_sam"));
    expect((await search(t.db, "sam@")).people).toEqual([]);
  });

  it("finds teams with their parent", async () => {
    const results = await search(t.db, "payrol");
    expect(results.teams).toEqual([{ id: "t_payroll", name: "Payroll", parentName: "HR" }]);
  });

  it("finds meeting rooms and phone booths with where they are, but not desks or kitchens", async () => {
    const board = await search(t.db, "board");
    expect(board.rooms).toEqual([
      {
        id: "sp_boardroom",
        name: "Boardroom",
        kind: "meeting_room",
        locationSlug: "sf",
        locationName: "San Francisco",
        floorSlug: "2",
        floorName: "Floor 2",
      },
    ]);
    expect((await search(t.db, "phone")).rooms.map((r) => r.id).sort()).toEqual([
      "sp_phone_1",
      "sp_phone_2",
    ]);
    expect((await search(t.db, "kitchen")).rooms).toEqual([]);
    expect((await search(t.db, "SF-2-014")).rooms).toEqual([]);
  });

  it("leaves out archived rooms", async () => {
    await t.db
      .update(s.space)
      .set({ archivedAt: new Date() })
      .where(eq(s.space.id, "sp_boardroom"));
    expect((await search(t.db, "boardroom")).rooms).toEqual([]);
  });

  it("treats LIKE wildcards in the query literally", async () => {
    const results = await search(t.db, "%");
    expect(results).toEqual({ people: [], teams: [], rooms: [] });
  });

  it("returns nothing for a blank query without touching the database", async () => {
    expect(await search(t.db, "   ")).toEqual({ people: [], teams: [], rooms: [] });
  });
});
