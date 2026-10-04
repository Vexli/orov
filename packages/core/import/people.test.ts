import { describe, expect, it } from "vitest";
import type { PersonRecord } from "../records";
import { parsePeopleCsv } from "../csv/people";
import { planPeopleImport, type PeopleSnapshot } from "./people";
import { planSkippingErrors } from "./plan";

const HEADER = "email,name,preferred_name,title,home_region,home_timezone,phone,start_date,active,manager_email,desk,teams,primary_team";

function person(overrides: Partial<PersonRecord> & { email: string }): PersonRecord {
  return {
    givenName: overrides.email.split("@")[0] ?? "x",
    familyName: null,
    preferredName: null,
    title: null,
    phone: null,
    homeRegion: "US",
    homeTimezone: null,
    startDate: null,
    endDate: null,
    active: true,
    managerEmail: null,
    deskCode: null,
    officeSlug: null,
    teamSlugs: [],
    primaryTeamSlug: null,
    identities: {},
    ...overrides,
  };
}

function snapshot(people: PersonRecord[] = [], extra: Partial<PeopleSnapshot> = {}): PeopleSnapshot {
  return {
    people: new Map(people.map((p) => [p.email, p])),
    teamSlugs: new Set(["hr", "eng", "payroll"]),
    // HR is led by Jane; Payroll, under HR, has no lead of its own.
    offices: new Map([["sf", { timezone: "America/Los_Angeles" }], ["ldn", { timezone: "Europe/London" }]]),
    teams: new Map([
      ["hr", { parentTeamId: null, leadId: "jane@x.com" }],
      ["payroll", { parentTeamId: "hr", leadId: null }],
      ["eng", { parentTeamId: null, leadId: null }],
    ]),
    desks: new Map([
      ["SF-2-014", { assignable: true, ownerEmail: null, timezone: "America/Los_Angeles", officeSlug: "sf" }],
      ["SF-2-015", { assignable: true, ownerEmail: null, timezone: "America/Los_Angeles", officeSlug: "sf" }],
      ["SF-ARCH-1", { assignable: false, ownerEmail: null, timezone: "America/Los_Angeles", officeSlug: "sf" }],
    ]),
    ...extra,
  };
}

function run(csvBody: string, snap: PeopleSnapshot, skip: number[] = []) {
  const parsed = parsePeopleCsv(`${HEADER}\n${csvBody}`);
  expect(parsed.fatal).toBeUndefined();
  return planPeopleImport(parsed.rows, parsed.issues, snap, new Set(skip));
}

describe("planPeopleImport", () => {
  it("marks new people as create and unchanged people as unchanged", () => {
    const existing = person({ email: "bob@x.com", givenName: "bob", teamSlugs: ["hr"] });
    const plan = run("bob@x.com,bob,,,US,,,,,,,hr,\nnew@x.com,New,,,US,,,,,,,,\n", snapshot([existing]));
    expect(plan.rows.map((r) => r.action)).toEqual(["unchanged", "create"]);
    expect(plan.canApply).toBe(true);
  });

  it("lists field changes for an update", () => {
    const existing = person({ email: "bob@x.com", givenName: "Bob", title: "Analyst" });
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

  describe("identities", () => {
    const run2 = (body: string, snap: PeopleSnapshot) => {
      const parsed = parsePeopleCsv(`${HEADER},github\n${body}`);
      return planPeopleImport(parsed.rows, parsed.issues, snap);
    };

    it("shows an identity change under the provider's name", () => {
      const existing = person({ email: "bob@x.com", givenName: "Bob", identities: { github: "old" } });
      const plan = run2("bob@x.com,Bob,,,US,,,,,,,,,new\n", snapshot([existing]));
      expect(plan.rows[0]?.changes).toEqual([{ field: "github", before: "old", after: "new" }]);
    });

    it("clears an identity when the cell is blank", () => {
      const existing = person({ email: "bob@x.com", givenName: "Bob", identities: { github: "bob" } });
      const plan = run2("bob@x.com,Bob,,,US,,,,,,,,,\n", snapshot([existing]));
      expect(plan.rows[0]?.changes).toEqual([{ field: "github", before: "bob", after: null }]);
    });

    it("rejects an account another person in the file also claims", () => {
      const plan = run2("a@x.com,A,,,US,,,,,,,,,same\nb@x.com,B,,,US,,,,,,,,,same\n", snapshot());
      expect(plan.rows.map((r) => r.action)).toEqual(["error", "error"]);
      expect(plan.rows[0]?.message).toBe('github "same" also belongs to b@x.com');
    });

    it("rejects an account held by someone outside the file", () => {
      const holder = person({ email: "c@x.com", identities: { github: "same" } });
      const plan = run2("a@x.com,A,,,US,,,,,,,,,same\n", snapshot([holder]));
      expect(plan.rows[0]?.message).toBe('github "same" also belongs to c@x.com');
    });

    it("keeps accounts whose column the file doesn't have", () => {
      const existing = person({ email: "bob@x.com", givenName: "Bob", identities: { github: "bob", linkedin: "bob-l" } });
      // Only a github column: LinkedIn is kept, GitHub is cleared by the blank cell.
      const plan = run2("bob@x.com,Bob,,,US,,,,,,,,,\n", snapshot([existing]));
      expect(plan.rows[0]?.changes).toEqual([{ field: "github", before: "bob", after: null }]);
      expect(plan.rows[0]?.record?.identities).toEqual({ linkedin: "bob-l" });
      // No identity columns at all: nothing changes.
      expect(run("bob@x.com,Bob,,,US,,,,,,,,\n", snapshot([existing])).rows[0]?.action).toBe("unchanged");
    });

    it("lets two people in the file swap accounts", () => {
      const a = person({ email: "a@x.com", givenName: "A", identities: { github: "one" } });
      const b = person({ email: "b@x.com", givenName: "B", identities: { github: "two" } });
      const plan = run2("a@x.com,A,,,US,,,,,,,,,two\nb@x.com,B,,,US,,,,,,,,,one\n", snapshot([a, b]));
      expect(plan.rows.map((r) => r.action)).toEqual(["update", "update"]);
    });
  });

  describe("home time zone from the desk", () => {
    it("fills a blank zone from the desk's office, and shows it in the dry run", () => {
      const plan = run("new@x.com,New,,,US,,,,,,SF-2-014,,\n", snapshot());
      expect(plan.rows[0]?.record?.homeTimezone).toBe("America/Los_Angeles");
      expect(plan.rows[0]?.changes).toContainEqual({ field: "homeTimezone", before: null, after: "America/Los_Angeles" });
    });

    it("never overwrites an explicit zone", () => {
      const plan = run("new@x.com,New,,,US,Europe/Kyiv,,,,,SF-2-014,,\n", snapshot());
      expect(plan.rows[0]?.record?.homeTimezone).toBe("Europe/Kyiv");
    });

    it("leaves the zone blank without a desk", () => {
      const plan = run("new@x.com,New,,,US,,,,,,,,\n", snapshot());
      expect(plan.rows[0]?.record?.homeTimezone).toBeNull();
    });
  });

  describe("skipping rows", () => {
    it("leaves a skipped row out and lets the rest apply", () => {
      // Line 3 is bad; skipping it makes the file applicable.
      const body = "a@x.com,A,,,US,,,,,,,,\nbad-email,Bad,,,US,,,,,,,,\nb@x.com,B,,,US,,,,,,,,\n";
      expect(run(body, snapshot()).canApply).toBe(false);
      const plan = run(body, snapshot(), [3]);
      expect(plan.rows.map((r) => r.action)).toEqual(["create", "skipped", "create"]);
      expect(plan.counts).toMatchObject({ create: 2, skipped: 1, error: 0 });
      expect(plan.canApply).toBe(true);
    });

    it.each([
      [
        "a manager defined on a skipped line",
        "lee@x.com,Lee,,,US,,,,,,,,\nama@x.com,Ama,,,US,,,,,lee@x.com,,,\n",
        "manager lee@x.com is on line 2, which is skipped",
      ],
      [
        "the other half of a desk swap",
        // Bob holds SF-2-014 and his row would move him to SF-2-015; Max's row takes SF-2-014.
        "bob@x.com,bob,,,US,,,,,,SF-2-015,,\nmax@x.com,max,,,US,,,,,,SF-2-014,,\n",
        'desk "SF-2-014" is still assigned to bob@x.com, whose line 2 is skipped',
      ],
    ])("flags a row that depends on %s", (_, body, message) => {
      const bob = person({ email: "bob@x.com", deskCode: "SF-2-014" });
      const max = person({ email: "max@x.com" });
      const plan = run(body, snapshot([bob, max]), [2]);
      expect(plan.rows[1]).toMatchObject({ action: "error", message });
      expect(plan.canApply).toBe(false);
    });

    it("can skip a row whose own parse failed", () => {
      const plan = run("not-an-email,X,,,US,,,,,,,,\na@x.com,A,,,US,,,,,,,,\n", snapshot(), [2]);
      expect(plan.rows[0]).toMatchObject({ action: "skipped", message: "email is not a valid address" });
      expect(plan.canApply).toBe(true);
    });

    it("can't apply when every row is skipped", () => {
      expect(run("a@x.com,A,,,US,,,,,,,,\n", snapshot(), [2]).canApply).toBe(false);
    });
  });

  describe("planSkippingErrors", () => {
    it("skips error rows, then the rows that depended on them, and says why", () => {
      // Lee's row is bad (unknown team). Ama's manager is Lee, so she goes too; Kim is fine.
      const body = [
        "lee@x.com,Lee,,,US,,,,,,,nope,",
        "ama@x.com,Ama,,,US,,,,,lee@x.com,,,",
        "kim@x.com,Kim,,,US,,,,,,,,",
        "",
      ].join("\n");
      const parsed = parsePeopleCsv(`${HEADER}\n${body}`);
      const { plan, skip } = planSkippingErrors((s) => planPeopleImport(parsed.rows, parsed.issues, snapshot(), s));
      expect([...skip].sort()).toEqual([2, 3]);
      expect(plan.rows.map((r) => [r.action, r.message])).toEqual([
        ["skipped", 'unknown team "nope" (import teams first)'],
        ["skipped", "manager lee@x.com is on line 2, which is skipped"],
        ["create", undefined],
      ]);
      expect(plan.canApply).toBe(true);
    });
  });

  describe("default manager", () => {
    const jane = person({ email: "jane@x.com", givenName: "Jane" });

    it("gives a blank manager the primary team's lead, and shows it in the dry run", () => {
      const plan = run("ama@x.com,Ama,,,US,,,,,,,payroll,payroll\n", snapshot([jane]));
      expect(plan.rows[0]?.record?.managerEmail).toBe("jane@x.com");
      expect(plan.rows[0]?.changes).toContainEqual({ field: "managerEmail", before: null, after: "jane@x.com" });
    });

    it("never replaces a manager given in the file", () => {
      const max = person({ email: "max@x.com" });
      const plan = run("ama@x.com,Ama,,,US,,,,,max@x.com,,hr,hr\n", snapshot([jane, max]));
      expect(plan.rows[0]?.record?.managerEmail).toBe("max@x.com");
    });

    it("doesn't make the lead their own manager", () => {
      const plan = run("jane@x.com,Jane,,,US,,,,,,,hr,hr\n", snapshot([jane]));
      expect(plan.rows[0]?.record?.managerEmail).toBeNull();
    });

    it("leaves the manager blank when the default would close a loop", () => {
      // Jane, the lead, reports to Ama in this file, so Ama can't default to Jane.
      const plan = run("jane@x.com,Jane,,,US,,,,,ama@x.com,,,\nama@x.com,Ama,,,US,,,,,,,hr,hr\n", snapshot([jane]));
      expect(plan.rows.map((r) => [r.action, r.record?.managerEmail])).toEqual([
        ["update", "ama@x.com"],
        ["create", null],
      ]);
    });
  });

  describe("end date", () => {
    const run3 = (header: string, body: string, snap: PeopleSnapshot) => {
      const parsed = parsePeopleCsv(`${header}\n${body}`);
      return planPeopleImport(parsed.rows, parsed.issues, snap);
    };

    it("keeps the stored last day when the file has no end_date column, and clears it from a blank cell", () => {
      const leaving = person({ email: "bob@x.com", givenName: "Bob", endDate: "2026-12-31" });
      expect(run("bob@x.com,Bob,,,US,,,,,,,,\n", snapshot([leaving])).rows[0]?.action).toBe("unchanged");
      const cleared = run3("email,name,home_region,end_date", "bob@x.com,Bob,US,\n", snapshot([leaving]));
      expect(cleared.rows[0]?.changes).toContainEqual({ field: "endDate", before: "2026-12-31", after: null });
    });

    it("refuses a last day before the start date", () => {
      const plan = run3("email,name,home_region,start_date,end_date", "a@x.com,A,US,2026-05-01,2026-04-30\n", snapshot());
      expect(plan.rows[0]?.message).toBe("end_date can't be before start_date");
    });
  });

  describe("office without a desk (N9)", () => {
    const plan = (body: string, snap = snapshot()) => {
      const parsed = parsePeopleCsv(`email,name,home_region,desk,office\n${body}`);
      return planPeopleImport(parsed.rows, parsed.issues, snap);
    };

    it("puts someone without a desk in an office, with that office's time zone", () => {
      const row = plan("kim@x.com,Kim,GB,,LDN\n").rows[0];
      expect(row?.record).toMatchObject({ officeSlug: "ldn", homeTimezone: "Europe/London" });
    });

    it("refuses an unknown office, and one that isn't the desk's", () => {
      expect(plan("kim@x.com,Kim,GB,,nyc\n").rows[0]?.message).toBe('unknown office "nyc"');
      expect(plan("kim@x.com,Kim,GB,SF-2-014,ldn\n").rows[0]?.message).toMatch(/isn't the office of desk "SF-2-014"/);
    });

    it("doesn't store an office that matches the desk's: the desk already says it", () => {
      expect(plan("kim@x.com,Kim,US,SF-2-014,sf\n").rows[0]?.record?.officeSlug).toBeNull();
    });
  });
});
