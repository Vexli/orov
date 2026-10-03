import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { PersonForm, TeamForm } from "@officeorg/core";
import { seedDemoData } from "../seed";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { listAudit } from "./audit";
import { ValidationError } from "./errors";
import { listDeskOptions, listPickerFloors } from "./spaces";
import { deleteTeam, getTeamForEdit, saveTeam } from "./teams";
import { getPersonForEdit, savePerson, setPersonActive } from "./people";

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

// A complete person form, with the fields the tests don't care about left blank.
function personInput(overrides: Partial<PersonForm>): PersonForm {
  return {
    email: "new@example.com",
    name: "New Person",
    preferredName: null,
    title: null,
    phone: null,
    homeRegion: "US",
    homeTimezone: null,
    startDate: null,
    active: true,
    managerId: null,
    assignedDeskId: null,
    teamIds: [],
    primaryTeamId: null,
    ...overrides,
  };
}

function teamInput(overrides: Partial<TeamForm>): TeamForm {
  return {
    slug: "new-team",
    name: "New Team",
    parentTeamId: null,
    leadId: null,
    slackChannelId: null,
    color: null,
    ...overrides,
  };
}

async function expectValidation(promise: Promise<unknown>, pattern: RegExp, field?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ValidationError);
  expect((error as Error).message).toMatch(pattern);
  if (field) expect((error as ValidationError).field).toBe(field);
}

describe("savePerson", () => {
  it("creates a person with a manager, a desk, teams and a primary team, and audits it", async () => {
    const { id } = await savePerson(
      t.db,
      ACTOR,
      personInput({
        managerId: "p_max",
        assignedDeskId: "sp_sf_2_016",
        teamIds: ["t_recruiting", "t_hr"],
        primaryTeamId: "t_recruiting",
      }),
    );

    const row = await t.db.query.person.findFirst({
      where: eq(s.person.id, id),
      with: { manager: true, assignedDesk: true, teamMembers: true },
    });
    expect(row?.manager?.id).toBe("p_max");
    expect(row?.assignedDesk?.name).toBe("SF-2-016");
    expect(row?.teamMembers.find((m) => m.isPrimary)?.teamId).toBe("t_recruiting");
    expect(row?.teamMembers).toHaveLength(2);

    const [entry] = await listAudit(t.db, { entity: "person" });
    expect(entry).toMatchObject({ actorEmail: ACTOR, action: "create", entityId: id });
    expect(entry?.after).toMatchObject({ email: "new@example.com", deskCode: "SF-2-016" });
  });

  it("rejects a duplicate email with the field name", async () => {
    await expectValidation(
      savePerson(t.db, ACTOR, personInput({ email: "bob@example.com" })),
      /already uses this email/,
      "email",
    );
  });

  it("rejects a manager that would close a loop, and leaves the chain unchanged", async () => {
    // Bob reports to Max, who reports to Jane. Making Jane report to Bob closes the loop.
    await expectValidation(
      savePerson(t.db, ACTOR, personInput({ email: "jane@example.com", name: "Jane Park", managerId: "p_bob" }), "p_jane"),
      /would create a loop/,
      "managerId",
    );
    const jane = await t.db.query.person.findFirst({ where: eq(s.person.id, "p_jane") });
    expect(jane?.managerId).toBeNull();
  });

  it("rejects being your own manager", async () => {
    await expectValidation(
      savePerson(t.db, ACTOR, personInput({ email: "max@example.com", name: "Max Osei", managerId: "p_max" }), "p_max"),
      /would create a loop/,
      "managerId",
    );
  });

  it("rejects a seat that another person holds, and names them", async () => {
    await expectValidation(
      savePerson(t.db, ACTOR, personInput({ assignedDeskId: "sp_sf_2_014" })),
      /SF-2-014 is already assigned to Bob Lindqvist/,
      "assignedDeskId",
    );
  });

  it("swaps desks when asked: the holder takes the person's old desk, and both are audited", async () => {
    await savePerson(
      t.db,
      ACTOR,
      personInput({ email: "max@example.com", name: "Max Osei", managerId: "p_jane", assignedDeskId: "sp_sf_2_014", swapDesk: true }),
      "p_max",
    );
    const desk = async (id: string) => (await t.db.query.person.findFirst({ where: eq(s.person.id, id) }))?.assignedDeskId;
    expect(await desk("p_max")).toBe("sp_sf_2_014");
    expect(await desk("p_bob")).toBe("sp_sf_2_010");

    const entries = await listAudit(t.db, { entity: "person" });
    expect(entries.slice(0, 2).map((e) => [e.entityId, (e.after as { deskCode: string }).deskCode])).toEqual([
      ["p_max", "SF-2-014"],
      ["p_bob", "SF-2-010"],
    ]);
  });

  it("leaves the holder deskless when the person taking their desk had none", async () => {
    await savePerson(t.db, ACTOR, personInput({ assignedDeskId: "sp_sf_2_014", swapDesk: true }));
    const bob = await t.db.query.person.findFirst({ where: eq(s.person.id, "p_bob") });
    const added = await t.db.query.person.findFirst({ where: eq(s.person.email, "new@example.com") });
    expect(bob?.assignedDeskId).toBeNull();
    expect(added?.assignedDeskId).toBe("sp_sf_2_014");
  });

  it("lets a person keep the seat they already have", async () => {
    await expect(
      savePerson(t.db, ACTOR, personInput({ email: "bob@example.com", name: "Bob Lindqvist", managerId: "p_max", assignedDeskId: "sp_sf_2_014" }), "p_bob"),
    ).resolves.toEqual({ id: "p_bob" });
  });

  it("rejects a room as a seat", async () => {
    await expectValidation(
      savePerson(t.db, ACTOR, personInput({ assignedDeskId: "sp_boardroom" })),
      /Boardroom is not a desk/,
      "assignedDeskId",
    );
  });

  it("rejects a desk on an archived floor", async () => {
    await t.db.update(s.floor).set({ archivedAt: new Date() }).where(eq(s.floor.id, "fl_sf_2"));
    await expectValidation(
      savePerson(t.db, ACTOR, personInput({ assignedDeskId: "sp_sf_2_016" })),
      /SF-2-016 is archived/,
      "assignedDeskId",
    );
  });

  it("rejects a team that does not exist, and writes nothing", async () => {
    await expectValidation(
      savePerson(t.db, ACTOR, personInput({ teamIds: ["t_gone"], primaryTeamId: "t_gone" })),
      /no longer exists/,
      "teamIds",
    );
    expect(await t.db.query.person.findFirst({ where: eq(s.person.email, "new@example.com") })).toBeUndefined();
  });

  it("round-trips through getPersonForEdit", async () => {
    const form = await getPersonForEdit(t.db, "p_bob");
    expect(form).toMatchObject({
      email: "bob@example.com",
      managerId: "p_max",
      assignedDeskId: "sp_sf_2_014",
      teamIds: expect.arrayContaining(["t_payroll", "t_hr"]),
      primaryTeamId: "t_payroll",
    });
    await savePerson(t.db, ACTOR, form!, "p_bob");
    const bob = await getPersonForEdit(t.db, "p_bob");
    expect(bob).toEqual(form);
  });

  it("deactivates a person and keeps the row", async () => {
    await setPersonActive(t.db, ACTOR, "p_sam", false);
    const sam = await t.db.query.person.findFirst({ where: eq(s.person.id, "p_sam") });
    expect(sam?.active).toBe(false);
    expect((await listAudit(t.db, { entity: "person" }))[0]).toMatchObject({ action: "update", entityId: "p_sam" });
  });
});

describe("listDeskOptions", () => {
  it("shows a seat held by someone else as unavailable, and the holder's own seat as available to them", async () => {
    const forBob = await listDeskOptions(t.db, "p_bob");
    const byName = (name: string) => forBob.find((d) => d.name === name);
    expect(byName("SF-2-014")?.available).toBe(true);
    expect(byName("SF-2-010")?.available).toBe(false);
    expect(byName("SF-2-016")?.available).toBe(true);
    expect(byName("SF-2-014")?.label).toBe("SF-2-014 · San Francisco, Floor 2");
    expect(byName("SF-2-010")).toMatchObject({
      floorId: "fl_sf_2",
      svgElementId: "desk-2-010",
      assignedPersonId: "p_max",
      assignedPersonName: "Max Osei",
    });
  });

  it("lists each floor's current drawing for the picker", async () => {
    const floors = await listPickerFloors(t.db);
    expect(floors.map((f) => [f.id, f.label, f.assetId])).toEqual([
      ["fl_sf_2", "San Francisco, Floor 2", "svg_sf_2_v1"],
      ["fl_sf_3", "San Francisco, Floor 3", "svg_sf_3_v1"],
    ]);
    expect(floors[0]!.svg).toContain('id="desk-2-014"');
  });
});

describe("saveTeam and deleteTeam", () => {
  it("creates a sub-team under hr", async () => {
    const { id } = await saveTeam(t.db, ACTOR, teamInput({ slug: "benefits", name: "Benefits", parentTeamId: "t_hr" }));
    const row = await t.db.query.team.findFirst({ where: eq(s.team.id, id), with: { parent: true } });
    expect(row?.parent?.slug).toBe("hr");
  });

  it("rejects making hr a sub-team of its own sub-team", async () => {
    await expectValidation(
      saveTeam(t.db, ACTOR, teamInput({ slug: "hr", name: "HR", parentTeamId: "t_payroll" }), "t_hr"),
      /would create a loop/,
      "parentTeamId",
    );
  });

  it("rejects a duplicate slug", async () => {
    await expectValidation(saveTeam(t.db, ACTOR, teamInput({ slug: "payroll", name: "Other" })), /already uses this slug/, "slug");
  });

  it("refuses to delete a team that still has members or sub-teams", async () => {
    await expectValidation(deleteTeam(t.db, ACTOR, "t_hr"), /sub-team\(s\) out of HR first/);
    await expectValidation(deleteTeam(t.db, ACTOR, "t_payroll"), /member\(s\) out of Payroll first/);
  });

  it("deletes an empty team and audits the delete", async () => {
    const { id } = await saveTeam(t.db, ACTOR, teamInput({ slug: "temp", name: "Temp" }));
    await deleteTeam(t.db, ACTOR, id);
    expect(await t.db.query.team.findFirst({ where: eq(s.team.id, id) })).toBeUndefined();
    const [entry] = await listAudit(t.db, { entity: "team" });
    expect(entry).toMatchObject({ action: "delete", entityId: id });
  });

  it("round-trips through getTeamForEdit", async () => {
    const form = await getTeamForEdit(t.db, "t_payroll");
    expect(form).toMatchObject({ slug: "payroll", parentTeamId: "t_hr", leadId: null });
    await saveTeam(t.db, ACTOR, form!, "t_payroll");
    expect(await getTeamForEdit(t.db, "t_payroll")).toEqual(form);
  });
});
