import { describe, expect, it } from "vitest";
import { splitFullName } from "../people/names";
import type { DirectoryPerson, DirectoryTeam } from "./model";
import {
  displayName,
  EMPTY_FILTERS,
  filterDirectory,
  initials,
  personInitials,
  locationSummary,
  locationText,
  teamScope,
} from "./filter";

const teams: DirectoryTeam[] = [
  { id: "t_hr", name: "HR", slug: "hr", parentTeamId: null },
  { id: "t_recruiting", name: "Recruiting", slug: "recruiting", parentTeamId: "t_hr" },
  { id: "t_payroll", name: "Payroll", slug: "payroll", parentTeamId: "t_hr" },
  { id: "t_eng", name: "Engineering", slug: "eng", parentTeamId: null },
];

const sf = {
  locationSlug: "sf",
  locationName: "San Francisco",
  locationRegion: "US",
  floorName: "Floor 2",
};

function person(
  overrides: Partial<DirectoryPerson> & { id: string; name: string },
): DirectoryPerson {
  return {
    ...splitFullName(overrides.name),
    identities: {},
    phone: null,
    preferredName: null,
    email: `${overrides.id}@example.com`,
    title: null,
    homeRegion: "US",
    homeRegionLabel: "United States",
    homeRegionFlag: null,
    homeTimezone: null,
    manager: null,
    desk: null,
    teams: [],
    ...overrides,
  };
}

const people: DirectoryPerson[] = [
  person({
    id: "p_jane",
    name: "Jane Park",
    title: "Head of HR",
    homeRegion: "CA-ON",
    homeRegionLabel: "Ontario, Canada",
    homeRegionFlag: null,
    desk: { id: "sp_3", name: "SF-2-003", ...sf },
    teams: [{ id: "t_hr", name: "HR", slug: "hr", isPrimary: true, inherited: false }],
  }),
  person({
    id: "p_bob",
    name: "Bob Lindqvist",
    preferredName: "Bobby",
    title: "Payroll Analyst",
    desk: { id: "sp_14", name: "SF-2-014", ...sf },
    teams: [
      { id: "t_payroll", name: "Payroll", slug: "payroll", isPrimary: true, inherited: false },
      { id: "t_hr", name: "HR", slug: "hr", isPrimary: false, inherited: false },
    ],
  }),
  person({
    id: "p_priya",
    name: "Priya Raman",
    homeRegion: "IN",
    homeRegionLabel: "India",
    homeRegionFlag: null,
    title: "Recruiter",
    teams: [{ id: "t_recruiting", name: "Recruiting", slug: "recruiting", isPrimary: true, inherited: false }],
  }),
  person({
    id: "p_sam",
    name: "Sam Lee",
    title: "Engineer",
    teams: [{ id: "t_eng", name: "Engineering", slug: "eng", isPrimary: true, inherited: false }],
  }),
];

const names = (list: DirectoryPerson[]) => list.map((p) => p.id);

describe("teamScope", () => {
  it("returns just the team when sub-teams are not included", () => {
    expect([...teamScope("t_hr", false, teams)]).toEqual(["t_hr"]);
  });

  it("walks down through every sub-team", () => {
    expect([...teamScope("t_hr", true, teams)].sort()).toEqual([
      "t_hr",
      "t_payroll",
      "t_recruiting",
    ]);
  });
});

describe("filterDirectory", () => {
  it("returns everyone with no filters", () => {
    expect(names(filterDirectory(people, EMPTY_FILTERS, teams))).toHaveLength(4);
  });

  it("includes sub-team members by default (U2)", () => {
    const hrTree = filterDirectory(people, { ...EMPTY_FILTERS, teamId: "t_hr" }, teams);
    expect(names(hrTree)).toEqual(["p_jane", "p_bob", "p_priya"]);
  });

  it("matches explicit memberships, so an inherited one doesn't defeat turning sub-teams off", () => {
    const priyaInHr = people.map((p) =>
      p.id === "p_priya"
        ? { ...p, teams: [...p.teams, { id: "t_hr", name: "HR", slug: "hr", isPrimary: false, inherited: true }] }
        : p,
    );
    const hrOnly = filterDirectory(priyaInHr, { ...EMPTY_FILTERS, teamId: "t_hr", includeSubteams: false }, teams);
    expect(names(hrOnly)).toEqual(["p_jane", "p_bob"]);
  });

  it("matches the team directly when sub-teams are turned off", () => {
    const hrOnly = filterDirectory(
      people,
      { ...EMPTY_FILTERS, teamId: "t_hr", includeSubteams: false },
      teams,
    );
    expect(names(hrOnly)).toEqual(["p_jane", "p_bob"]);
  });

  it("searches name, preferred name, title and seat code, case-insensitively", () => {
    expect(names(filterDirectory(people, { ...EMPTY_FILTERS, q: "bobby" }, teams))).toEqual([
      "p_bob",
    ]);
    expect(names(filterDirectory(people, { ...EMPTY_FILTERS, q: "analyst" }, teams))).toEqual([
      "p_bob",
    ]);
    expect(names(filterDirectory(people, { ...EMPTY_FILTERS, q: "sf-2-003" }, teams))).toEqual([
      "p_jane",
    ]);
  });

  it("requires every search word to match", () => {
    expect(names(filterDirectory(people, { ...EMPTY_FILTERS, q: "jane park" }, teams))).toEqual([
      "p_jane",
    ]);
    expect(names(filterDirectory(people, { ...EMPTY_FILTERS, q: "jane bob" }, teams))).toEqual([]);
  });

  it("filters by location through the desk, which leaves remote people out", () => {
    expect(names(filterDirectory(people, { ...EMPTY_FILTERS, locationSlug: "sf" }, teams))).toEqual(
      ["p_jane", "p_bob"],
    );
  });

  it("can show only people who have a desk", () => {
    expect(names(filterDirectory(people, { ...EMPTY_FILTERS, hasDesk: true }, teams))).toEqual([
      "p_jane",
      "p_bob",
    ]);
  });

  it("combines filters", () => {
    const result = filterDirectory(
      people,
      { ...EMPTY_FILTERS, teamId: "t_hr", includeSubteams: true, hasDesk: true, q: "payroll" },
      teams,
    );
    expect(names(result)).toEqual(["p_bob"]);
  });
});

describe("labels", () => {
  it("uses the preferred name when there is one", () => {
    expect(displayName(people[1]!)).toBe("Bobby");
    expect(displayName(people[0]!)).toBe("Jane Park");
  });

  it("says where someone is based in the viewer's format, badged with their desk or Remote", () => {
    expect(locationSummary(people[0]!)).toEqual({ region: "Ontario, Canada", badge: "SF-2-003" });
    expect(locationSummary(people[2]!)).toEqual({ region: "India", badge: "Remote" });
    expect(locationText(people[0]!)).toBe("Ontario, Canada SF-2-003");
  });
});

describe("personInitials", () => {
  it.each([
    [{ preferredName: null, givenName: "Ana María de la", familyName: "Cruz" }, "AC"],
    [{ preferredName: null, givenName: "Mary Ann", familyName: "Smith" }, "MS"],
    [{ preferredName: null, givenName: "Priya", familyName: null }, "P"],
    [{ preferredName: "Bobby Tables", givenName: "Robert", familyName: "Lindqvist" }, "BT"],
  ])("%j → %j", (person, expected) => {
    expect(personInitials(person)).toBe(expected);
  });
});

describe("initials", () => {
  it.each([
    ["Bob Lindqvist", "BL"],
    ["priya", "P"],
    ["Ana María de la Cruz", "AM"],
    ["  ", ""],
    ["E\u0301mile Zola", "E\u0301Z"],
    ["𝒜lex Ørsted", "𝒜Ø"],
  ])("%j → %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});
