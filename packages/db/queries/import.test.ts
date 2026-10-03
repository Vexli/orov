import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { seedDemoData } from "../seed";
import * as s from "../schema";
import { startTestDatabase, type TestDatabase } from "../test-utils";
import { listAudit } from "./audit";
import {
  applyPeopleCsv,
  applyTeamsCsv,
  exportPeopleCsv,
  exportTeamsCsv,
  ImportRejectedError,
  planPeopleCsv,
  planTeamsCsv,
} from "./import";

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

const HEADER = "email,name,preferred_name,title,home_region,home_timezone,phone,start_date,active,manager_email,desk,teams,primary_team";

function people(...rows: string[]) {
  return [HEADER, ...rows].join("\n") + "\n";
}

async function personByEmail(email: string) {
  return t.db.query.person.findFirst({
    where: eq(s.person.email, email),
    with: { manager: true, assignedDesk: true, teamMembers: { with: { team: true } } },
  });
}

describe("people import", () => {
  it("re-importing an export changes nothing and writes no audit rows", async () => {
    const csv = await exportPeopleCsv(t.db);
    const dry = await planPeopleCsv(t.db, csv);
    expect(dry.ok && dry.plan.counts).toEqual({ create: 0, update: 0, unchanged: 5, error: 0 });

    const result = await applyPeopleCsv(t.db, "admin@example.com", csv);
    expect(result).toEqual({ created: 0, updated: 0, unchanged: 5 });
    expect(await listAudit(t.db)).toEqual([]);
  });

  it("creates a person whose manager and desk are set later in the same file", async () => {
    const csv = people(
      "ama@example.com,Ama Ito,,Recruiter,US,,,,,lee@example.com,SF-2-016,recruiting,recruiting",
      "lee@example.com,Lee Chen,,Team Lead,US,,,,,jane@example.com,,hr;recruiting,recruiting",
    );
    await applyPeopleCsv(t.db, "jane@example.com", csv);

    const ama = await personByEmail("ama@example.com");
    expect(ama?.manager?.email).toBe("lee@example.com");
    expect(ama?.assignedDesk?.name).toBe("SF-2-016");
    expect(ama?.teamMembers.map((m) => m.team.slug)).toEqual(["recruiting"]);

    const lee = await personByEmail("lee@example.com");
    expect(lee?.manager?.email).toBe("jane@example.com");
    const primary = lee?.teamMembers.find((m) => m.isPrimary);
    expect(primary?.team.slug).toBe("recruiting");
  });

  it("lets two people swap desks in one file", async () => {
    // Bob is on SF-2-014 and Max is on SF-2-010. Each takes the other's desk.
    const csv = people(
      "bob@example.com,Bob Lindqvist,,Payroll Analyst,US,,,,,max@example.com,SF-2-010,payroll,payroll",
      "max@example.com,Max Osei,,HR Business Partner,US,,,,,jane@example.com,SF-2-014,hr,hr",
    );
    await applyPeopleCsv(t.db, "jane@example.com", csv);
    expect((await personByEmail("bob@example.com"))?.assignedDesk?.name).toBe("SF-2-010");
    expect((await personByEmail("max@example.com"))?.assignedDesk?.name).toBe("SF-2-014");
  });

  it("writes nothing when any row is invalid", async () => {
    const before = await t.db.select().from(s.person);
    const csv = people(
      "good@example.com,Good Person,,,US,,,,,,,,",
      "not-an-email,Bad Row,,,US,,,,,,,,",
    );
    await expect(applyPeopleCsv(t.db, "jane@example.com", csv)).rejects.toBeInstanceOf(ImportRejectedError);
    const after = await t.db.select().from(s.person);
    expect(after).toHaveLength(before.length);
    expect(await personByEmail("good@example.com")).toBeUndefined();
  });

  it("rejects a manager cycle and writes nothing", async () => {
    // Existing chain: Bob → Max → Jane. Setting Jane's manager to Bob closes a loop.
    const csv = people(
      "jane@example.com,Jane Park,,Head of HR,CA,America/Toronto,,2019-03-04,true,bob@example.com,SF-2-003,hr,hr",
    );
    const dry = await planPeopleCsv(t.db, csv);
    expect(dry.ok && dry.plan.canApply).toBe(false);
    await expect(applyPeopleCsv(t.db, "jane@example.com", csv)).rejects.toThrow(
      /First problem, line 2: manager chain loops back to jane@example.com/,
    );
    expect((await personByEmail("jane@example.com"))?.managerId).toBeNull();
  });

  it("reports an unknown team and an unknown desk as row errors in the dry run", async () => {
    const csv = people(
      "a@example.com,A,,,US,,,,,,SF-9-999,,",
      "b@example.com,B,,,US,,,,,,,nope,",
    );
    const dry = await planPeopleCsv(t.db, csv);
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;
    expect(dry.plan.rows.map((r) => r.message)).toEqual([
      'unknown desk "SF-9-999"',
      'unknown team "nope" (import teams first)',
    ]);
  });

  it("records create and update audit rows with the actor and before/after JSON", async () => {
    const csv = people(
      "jane@example.com,Jane Park,,Chief People Officer,CA,America/Toronto,,2019-03-04,true,,SF-2-003,hr,hr",
      "new@example.com,New Hire,,,US,,,,,,,,",
    );
    await applyPeopleCsv(t.db, "admin@example.com", csv);

    const entries = await listAudit(t.db);
    expect(entries.map((e) => [e.actorEmail, e.action, e.entity]).sort()).toEqual([
      ["admin@example.com", "create", "person"],
      ["admin@example.com", "update", "person"],
    ]);
    const update = entries.find((e) => e.action === "update");
    expect(update?.before).toMatchObject({ email: "jane@example.com", title: "Head of HR" });
    expect(update?.after).toMatchObject({ email: "jane@example.com", title: "Chief People Officer" });
  });
});

describe("teams import", () => {
  it("creates a child team, renames another, and records audit rows", async () => {
    const csv = [
      "slug,name,parent_slug,slack_channel_id,color",
      "hr-ops,HR Operations,hr,,",
      "recruiting,Talent,hr,,#22c55e",
      "",
    ].join("\n");
    const result = await applyTeamsCsv(t.db, "admin@example.com", csv);
    // hr is not in the file, so it is neither created nor updated.
    expect(result).toEqual({ created: 1, updated: 1, unchanged: 0 });

    const child = await t.db.query.team.findFirst({
      where: eq(s.team.slug, "hr-ops"),
      with: { parent: true },
    });
    expect(child?.parent?.slug).toBe("hr");

    const renamed = await t.db.query.team.findFirst({ where: eq(s.team.slug, "recruiting") });
    expect(renamed?.name).toBe("Talent");
    // The lead is not part of the spreadsheet, so it must survive an import.
    const hr = await t.db.query.team.findFirst({ where: eq(s.team.slug, "hr") });
    expect(hr?.leadId).toBe("p_jane");

    expect((await listAudit(t.db, { entity: "team" })).length).toBe(2);
  });

  it("rejects a parent cycle and writes nothing", async () => {
    // hr is the root. Making it a child of payroll closes a loop: payroll → hr → payroll.
    const csv = ["slug,name,parent_slug,slack_channel_id,color", "hr,HR,payroll,,", ""].join("\n");
    const dry = await planTeamsCsv(t.db, csv);
    expect(dry.ok && dry.plan.canApply).toBe(false);
    await expect(applyTeamsCsv(t.db, "admin@example.com", csv)).rejects.toThrow(ImportRejectedError);
    expect((await t.db.query.team.findFirst({ where: eq(s.team.slug, "hr") }))?.parentTeamId).toBeNull();
  });

  it("round-trips an export without changes", async () => {
    const csv = await exportTeamsCsv(t.db);
    expect(await applyTeamsCsv(t.db, "admin@example.com", csv)).toEqual({ created: 0, updated: 0, unchanged: 3 });
  });
});
