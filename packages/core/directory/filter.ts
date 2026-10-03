import type { DirectoryPerson, DirectoryTeam } from "./model";

export interface DirectoryFilters {
  // Free text, matched against name, preferred name, email, title and seat code.
  q: string;
  teamId: string | null;
  // With a team selected, also include everyone on its sub-teams (plan.md U2).
  includeSubteams: boolean;
  locationSlug: string | null;
  hasDesk: boolean;
}

export const EMPTY_FILTERS: DirectoryFilters = {
  q: "",
  teamId: null,
  includeSubteams: false,
  locationSlug: null,
  hasDesk: false,
};

// The team and every team below it. Cycles in the data can't make this loop forever.
export function teamScope(teamId: string, includeSubteams: boolean, teams: DirectoryTeam[]): Set<string> {
  const scope = new Set([teamId]);
  if (!includeSubteams) return scope;
  const queue = [teamId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const team of teams) {
      if (team.parentTeamId === current && !scope.has(team.id)) {
        scope.add(team.id);
        queue.push(team.id);
      }
    }
  }
  return scope;
}

export function filterDirectory(
  people: DirectoryPerson[],
  filters: DirectoryFilters,
  teams: DirectoryTeam[],
): DirectoryPerson[] {
  const scope = filters.teamId ? teamScope(filters.teamId, filters.includeSubteams, teams) : null;
  const tokens = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return people.filter((p) => {
    if (scope && !p.teams.some((t) => scope.has(t.id))) return false;
    if (filters.locationSlug && p.desk?.locationSlug !== filters.locationSlug) return false;
    if (filters.hasDesk && !p.desk) return false;
    if (tokens.length > 0) {
      const haystack = [p.name, p.preferredName ?? "", p.email, p.title ?? "", p.desk?.name ?? ""]
        .join(" ")
        .toLowerCase();
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });
}

export function displayName(person: Pick<DirectoryPerson, "name" | "preferredName">): string {
  return person.preferredName ?? person.name;
}

// The one-line location summary. With a desk: "Based in CA · Desk SF-2-014". Without one: "Remote – IN".
export function basedInLabel(person: DirectoryPerson): string {
  if (!person.desk) return `Remote – ${person.homeCountry}`;
  return `Based in ${person.homeCountry} · Desk ${person.desk.name}`;
}
