import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_PEOPLE_FILTERS,
  filterAdminPeople,
  filterAdminTeams,
  type AdminPersonRow,
} from "./filter";

const teams = [
  { id: "t_hr", name: "HR", slug: "hr", parentTeamId: null },
  { id: "t_payroll", name: "Payroll", slug: "payroll", parentTeamId: "t_hr" },
  { id: "t_eng", name: "Engineering", slug: "eng", parentTeamId: null },
];

const row = (o: Partial<AdminPersonRow> & { name: string }): AdminPersonRow & { id: string } => ({
  id: o.name.toLowerCase(),
  email: `${o.name.toLowerCase()}@x.com`,
  title: null,
  managerNames: [],
  deskName: null,
  active: true,
  teams: [],
  ...o,
});

const people = [
  row({ name: "Jane", title: "Head of HR", deskName: "SF-2-003", teams: [{ id: "t_hr" }] }),
  row({ name: "Bob", managerNames: ["Jane"], deskName: "SF-2-014", teams: [{ id: "t_payroll" }] }),
  row({ name: "Sam", active: false, teams: [{ id: "t_eng" }] }),
];

const names = (rows: { name: string }[]) => rows.map((r) => r.name);
const run = (f: Partial<typeof DEFAULT_ADMIN_PEOPLE_FILTERS>) =>
  names(filterAdminPeople(people, { ...DEFAULT_ADMIN_PEOPLE_FILTERS, ...f }, teams));

describe("filterAdminPeople", () => {
  it("shows active people by default", () => {
    expect(run({})).toEqual(["Jane", "Bob"]);
  });

  it("filters by status", () => {
    expect(run({ status: "inactive" })).toEqual(["Sam"]);
    expect(run({ status: "all" })).toEqual(["Jane", "Bob", "Sam"]);
  });

  it("matches every word against name, email, title, manager and desk", () => {
    expect(run({ q: "jane" })).toEqual(["Jane", "Bob"]); // Bob's manager is Jane
    expect(run({ q: "head hr" })).toEqual(["Jane"]);
    expect(run({ q: "sf-2-014" })).toEqual(["Bob"]);
  });

  it("scopes to a team, with sub-teams unless turned off", () => {
    expect(run({ teamId: "t_hr" })).toEqual(["Jane", "Bob"]);
    expect(run({ teamId: "t_hr", includeSubteams: false })).toEqual(["Jane"]);
  });

  it("filters by desk", () => {
    expect(run({ status: "all", desk: "without" })).toEqual(["Sam"]);
    expect(run({ status: "all", desk: "with" })).toEqual(["Jane", "Bob"]);
  });
});

describe("filterAdminTeams", () => {
  it("keeps every team for a blank query", () => {
    expect([...filterAdminTeams(teams, "  ").visible].sort()).toEqual(["t_eng", "t_hr", "t_payroll"]);
  });

  it("keeps a nested match's ancestors, marked as not matching", () => {
    const { visible, matched } = filterAdminTeams(teams, "payr");
    expect([...visible].sort()).toEqual(["t_hr", "t_payroll"]);
    expect([...matched]).toEqual(["t_payroll"]);
  });

  it("matches the slug", () => {
    expect([...filterAdminTeams(teams, "eng").matched]).toEqual(["t_eng"]);
  });
});
