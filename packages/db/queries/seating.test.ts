import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { seedTestFixture } from "../test-fixture";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { listAudit } from "./audit";
import { applySeating, loadSeatingInput, previewSeating } from "./seating";

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

const ACTOR = "jane@example.com";
const deskOf = async (id: string) =>
  (await t.db.query.person.findFirst({ where: eq(s.person.id, id), with: { assignedDesk: true } }))?.assignedDesk?.name;

describe("seating planner", () => {
  it("knows every desk's position and who sits in the office", async () => {
    const input = await loadSeatingInput(t.db, "loc_sf");
    expect(input.desks.length).toBe(21);
    expect(input.people.map((p) => p.id).sort()).toEqual(["p_bob", "p_jane", "p_max", "p_sam"]);
  });

  it("brings a scattered team together, and applies exactly the previewed moves", async () => {
    // Sam (Recruiting) sits on Floor 3; move Bob (Payroll) there too, away from HR.
    await t.db.update(s.person).set({ assignedDeskId: null }).where(eq(s.person.id, "p_bob"));
    await t.db.update(s.person).set({ assignedDeskId: "sp_sf_3_005" }).where(eq(s.person.id, "p_bob"));
    const { moves } = await previewSeating(t.db, "loc_sf", ["p_jane", "p_max"]);
    expect(moves.length).toBeGreaterThan(0);
    // Locked people never move.
    expect(moves.map((m) => m.personId)).not.toContain("p_jane");
    expect(moves.map((m) => m.personId)).not.toContain("p_max");

    const result = await applySeating(t.db, ACTOR, "loc_sf", moves.map((m) => ({ personId: m.personId, deskId: m.toDeskId })));
    expect(result.moved).toBe(moves.length);
    for (const m of moves) expect(await deskOf(m.personId)).toBe(m.toCode);
    expect((await listAudit(t.db, { entity: "person" })).length).toBe(moves.length);
  });

  it("won't move someone outside the plan off their desk", async () => {
    // Max sits at SF-2-010; a plan for Bob alone can't take it.
    await expect(applySeating(t.db, ACTOR, "loc_sf", [{ personId: "p_bob", deskId: "sp_sf_2_010" }])).rejects.toThrow(
      /given to someone else/,
    );
    expect(await deskOf("p_bob")).toBe("SF-2-014");
  });
});
