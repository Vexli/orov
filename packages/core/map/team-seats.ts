import { explicitTeams, teamScope } from "../directory/filter";
import type { DirectoryPerson, DirectoryTeam } from "../directory/model";
import type { MapLocation, MapSeat } from "./model";

// Where a team sits (U2): every member's seat, and how many are on each floor. Members are the
// people in the team, or in it and its sub-teams when `includeSubteams` is on, the same scope
// the directory filter uses.

export interface FloorCount {
  locationSlug: string;
  locationName: string;
  floorSlug: string;
  floorName: string;
  count: number;
}

export interface TeamSeats {
  members: number;
  seats: MapSeat[];
  // In office and floor order. Floors where nobody in the team sits are left out.
  perFloor: FloorCount[];
  // Members without a desk, who can't be shown on the map.
  deskless: number;
}

export function teamSeats(
  teamId: string,
  includeSubteams: boolean,
  data: {
    teams: DirectoryTeam[];
    people: DirectoryPerson[];
    seats: MapSeat[];
    locations: MapLocation[];
  },
): TeamSeats {
  const scope = teamScope(teamId, includeSubteams, data.teams);
  const members = new Set(
    data.people.filter((p) => explicitTeams(p).some((t) => scope.has(t.id))).map((p) => p.id),
  );
  const seats = data.seats.filter((s) => members.has(s.personId));

  const perFloor: FloorCount[] = [];
  for (const location of data.locations) {
    for (const floor of location.floors) {
      const count = seats.filter(
        (s) => s.locationSlug === location.slug && s.floorSlug === floor.slug,
      ).length;
      if (count > 0) {
        perFloor.push({
          locationSlug: location.slug,
          locationName: location.name,
          floorSlug: floor.slug,
          floorName: floor.name,
          count,
        });
      }
    }
  }

  const seated = new Set(seats.map((s) => s.personId));
  return {
    members: members.size,
    seats,
    perFloor,
    deskless: [...members].filter((id) => !seated.has(id)).length,
  };
}
