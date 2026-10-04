import { describe, expect, it } from "vitest";
import type { DirectoryPerson, DirectoryTeam } from "../directory/model";
import type { MapLocation, MapSeat } from "./model";
import { teamSeats } from "./team-seats";

const teams: DirectoryTeam[] = [
  { id: "t_hr", name: "HR", slug: "hr", parentTeamId: null },
  { id: "t_payroll", name: "Payroll", slug: "payroll", parentTeamId: "t_hr" },
  { id: "t_recruiting", name: "Recruiting", slug: "recruiting", parentTeamId: "t_hr" },
];

const person = (id: string, teamIds: string[]): DirectoryPerson => ({
  id,
  name: id,
  identities: {},
  preferredName: null,
  email: `${id}@x.com`,
  title: null,
  homeRegion: "US",
  homeRegionLabel: "United States",
  homeTimezone: null,
  manager: null,
  desk: null,
  teams: teamIds.map((t) => ({ id: t, name: t, slug: t, isPrimary: false })),
});

const seat = (personId: string, floorSlug: string): MapSeat => ({
  personId,
  spaceId: `sp_${personId}`,
  svgElementId: `desk-${floorSlug}-001`,
  deskName: `SF-${floorSlug}-001`,
  floorSlug,
  floorName: `Floor ${floorSlug}`,
  locationSlug: "sf",
  locationName: "San Francisco",
  areaSlug: null,
});

const floor = (slug: string) => ({
  slug,
  name: `Floor ${slug}`,
  level: Number(slug),
  hasDrawing: true,
  deskCount: 0,
  roomCount: 0,
});

const locations: MapLocation[] = [
  {
    slug: "sf",
    name: "San Francisco",
    regionLabel: "",
    floors: [floor("2"), floor("3"), floor("4")],
  },
];

// The demo seed's shape: Jane and Max in HR, Bob in Payroll, Priya (no desk) and Sam in Recruiting.
const people = [
  person("jane", ["t_hr"]),
  person("max", ["t_hr"]),
  person("bob", ["t_payroll", "t_hr"]),
  person("priya", ["t_recruiting"]),
  person("sam", ["t_recruiting"]),
];
const seats = [seat("jane", "2"), seat("max", "2"), seat("bob", "2"), seat("sam", "3")];
const data = { teams, people, seats, locations };

describe("teamSeats", () => {
  it("counts only direct members without sub-teams", () => {
    const result = teamSeats("t_hr", false, data);
    expect(result.members).toBe(3);
    expect(result.perFloor.map((f) => [f.floorSlug, f.count])).toEqual([["2", 3]]);
    expect(result.deskless).toBe(0);
  });

  it("U2: with sub-teams, counts each floor and the members without a desk", () => {
    const result = teamSeats("t_hr", true, data);
    expect(result.members).toBe(5);
    expect(result.seats.map((s) => s.personId)).toEqual(["jane", "max", "bob", "sam"]);
    expect(result.perFloor.map((f) => [f.floorName, f.count])).toEqual([
      ["Floor 2", 3],
      ["Floor 3", 1],
    ]);
    expect(result.deskless).toBe(1);
  });

  it("is empty for a team nobody is in", () => {
    expect(teamSeats("t_missing", true, data)).toEqual({
      members: 0,
      seats: [],
      perFloor: [],
      deskless: 0,
    });
  });
});
