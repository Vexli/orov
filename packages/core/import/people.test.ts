import { describe, expect, it } from "vitest";
import type { PersonRecord } from "../records";
import { parsePeopleCsv } from "../csv/people";
import { planPeopleImport, type PeopleSnapshot } from "./people";

const HEADER = "email,name,preferred_name,title,home_region,home_timezone,phone,start_date,active,manager_email,desk,teams,primary_team";

function person(overrides: Partial<PersonRecord> & { email: string }): PersonRecord {
  return {
    name: overrides.email.split("@")[0] ?? "x",
    preferredName: null,
    title: null,
    phone: null,
    homeRegion: "US",
    homeTimezone: null,
    startDate: null,
    active: true,
    managerEmail: null,
    deskCode: null,
    teamSlugs: [],
    primaryTeamSlug: null,
    ...overrides,
  };
}

function snapshot(people: PersonRecord[] = [], extra: Partial<PeopleSnapshot> = {}): PeopleSnapshot {
  return {
    people: new Map(people.map((p) => [p.email, p])),
    teamSlugs: new Set(["hr", "eng"]),
    desks: new Map([
      ["SF-2-014", { assignable: true, ownerEmail: null }],
      ["SF-2-015", { assignable: true, ownerEmail: null }],
      ["SF-ARCH-1", { assignable: false, ownerEmail: null }],
    ]),
    ...extra,
  };
}

function run(csvBody: string, snap: PeopleSnapshot) {
  const parsed = parsePeopleCsv(`${HEADER}\n${csvBody}`);
  expect(parsed.fatal).toBeUndefined();
  return planPeopleImport(parsed.rows, parsed.issues, snap);
}

describe("planPeopleImport", () => {
  it("marks new people as create and unchanged people as unchanged", () => {
    const existing = person({ email: "bob@x.com", name: "bob", teamSlugs: ["hr"] });
    const plan = run("bob@x.com,bob,,,US,,,,,,,hr,\nnew@x.com,New,,,US,,,,,,,,\n", snapshot([existing]));
    expect(plan.rows.map((r) => r.action)).toEqual(["unchanged", "create"]);
    expect(plan.canApply).toBe(true);
  });

  it("lists field changes for an update", () => {
    const existing = person({ email: "bob@x.com", name: "Bob", title: "Analyst" });
    const plan = run("bob@x.com,Bob,,Senior Analyst,US,,,,,,,,\n", snapshot([existing]));
    expect(plan.rows[0]?.action).toBe("update");
    expect(plan.rows[0]?.changes).toEqual([{ field: "title", before: "Analyst", after: "Senior Analyst" }]);
  });

  it("blocks the whole import when a manager is missing", () => {
    const plan = run("a@x.com,A,,,US,,,,,ghost@x.com,,,\nb@x.com,B,,,US,,,,,,,,\n", snapshot());
    const bad = plan.rows.find((r) => r.key === "a@x.com");
    expect(bad?.action).toBe("error");
    expect(bad?.message).toMatch(/ghost@x.com is not in the file or the database/);
    expect(plan.canApply).toBe(false);
  });

  it("resolves a manager that appears later in the same file", () => {
    const plan = run("bob@x.com,Bob,,,US,,,,,max@x.com,,,\nmax@x.com,Max,,,US,,,,,,,,\n", snapshot());
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "create"]);
  });

  it("rejects a manager cycle within the file", () => {
    const plan = run("a@x.com,A,,,US,,,,,b@x.com,,,\nb@x.com,B,,,US,,,,,a@x.com,,,\n", snapshot());
    expect(plan.rows.every((r) => r.action === "error")).toBe(true);
    expect(plan.rows[0]?.message).toMatch(/loops back/);
  });

  it("rejects a manager cycle that closes through an existing person", () => {
    const existingB = person({ email: "b@x.com", managerEmail: "a@x.com" });
    // a -> b -> a, where b's manager already is a in the database.
    const plan = run("a@x.com,A,,,US,,,,,b@x.com,,,\n", snapshot([existingB]));
    expect(plan.rows[0]?.message).toMatch(/loops back to a@x.com/);
  });

  it("rejects a desk that another existing person still holds", () => {
    const holder = person({ email: "max@x.com", deskCode: "SF-2-014" });
    const plan = run("bob@x.com,Bob,,,US,,,,,,SF-2-014,,\n", snapshot([holder]));
    expect(plan.rows[0]?.message).toMatch(/also assigned to max@x.com/);
  });

  it("allows two people in the file to swap desks", () => {
    const a = person({ email: "a@x.com", deskCode: "SF-2-014" });
    const b = person({ email: "b@x.com", deskCode: "SF-2-015" });
    const plan = run("a@x.com,A,,,US,,,,,,SF-2-015,,\nb@x.com,B,,,US,,,,,,SF-2-014,,\n", snapshot([a, b]));
    expect(plan.rows.map((r) => r.action)).toEqual(["update", "update"]);
    expect(plan.canApply).toBe(true);
  });

  it("rejects a desk that is archived or is not a desk", () => {
    const plan = run("bob@x.com,Bob,,,US,,,,,,SF-ARCH-1,,\n", snapshot());
    expect(plan.rows[0]?.message).toMatch(/not a desk, or its floor is archived/);
  });

  it("rejects an unknown team", () => {
    const plan = run("bob@x.com,Bob,,,US,,,,,,,nope,\n", snapshot());
    expect(plan.rows[0]?.message).toMatch(/unknown team "nope"/);
  });

  it("flags a duplicate email on the second row only", () => {
    const plan = run("a@x.com,A,,,US,,,,,,,,\na@x.com,A2,,,US,,,,,,,,\n", snapshot());
    expect(plan.rows.map((r) => r.action)).toEqual(["create", "error"]);
    expect(plan.rows[1]?.message).toMatch(/also appears on line 2/);
  });

  it("clears a manager when the cell is blank, since the file is the full state", () => {
    const existing = person({ email: "bob@x.com", managerEmail: "max@x.com" });
    const max = person({ email: "max@x.com" });
    const plan = run("bob@x.com,bob,,,US,,,,,,,,\n", snapshot([existing, max]));
    expect(plan.rows[0]?.changes).toEqual([{ field: "managerEmail", before: "max@x.com", after: null }]);
  });

  it("carries parse issues into the plan as error rows", () => {
    const plan = run("bad-email,Bad,,,US,,,,,,,,\n", snapshot());
    expect(plan.rows[0]).toMatchObject({ action: "error", line: 2 });
    expect(plan.canApply).toBe(false);
  });
});
