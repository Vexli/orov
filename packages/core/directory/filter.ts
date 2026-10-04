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
  includeSubteams: true,
  locationSlug: null,
  hasDesk: false,
};

// The team and every team below it. Cycles in the data can't make this loop forever.
export function teamScope(
  teamId: string,
  includeSubteams: boolean,
  teams: Pick<DirectoryTeam, "id" | "parentTeamId">[],
): Set<string> {
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

// The teams someone was put in, leaving out the ones inherited from a sub-team (#23). Filters and
// highlights match on these: the "Include sub-teams" option already reaches the rest, and
// matching inherited ones too would make that option do nothing.
export function explicitTeams<T extends { inherited?: boolean }>(person: { teams: T[] }): T[] {
  return person.teams.filter((t) => !t.inherited);
}

// Every whitespace-separated token of `q` appears somewhere in the fields, ignoring case.
// A blank query matches everything.
export function matchesQuery(fields: readonly (string | null | undefined)[], q: string): boolean {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function filterDirectory(
  people: DirectoryPerson[],
  filters: DirectoryFilters,
  teams: DirectoryTeam[],
): DirectoryPerson[] {
  const scope = filters.teamId ? teamScope(filters.teamId, filters.includeSubteams, teams) : null;

  return people.filter((p) => {
    if (scope && !explicitTeams(p).some((t) => scope.has(t.id))) return false;
    if (filters.locationSlug && p.desk?.locationSlug !== filters.locationSlug) return false;
    if (filters.hasDesk && !p.desk) return false;
    return matchesQuery([p.name, p.preferredName, p.email, p.title, p.desk?.name], filters.q);
  });
}

export function displayName(person: Pick<DirectoryPerson, "name" | "preferredName">): string {
  return person.preferredName ?? person.name;
}

// A person's avatar letters: their preferred name's, else the first given name's and the family
// name's ("Ana María de la Cruz" → "AC", where splitting the full name would give "AM").
export function personInitials(
  person: Pick<DirectoryPerson, "preferredName" | "givenName" | "familyName">,
): string {
  if (person.preferredName) return initials(person.preferredName);
  const first = person.givenName.trim().split(/\s+/)[0] ?? "";
  return initials(person.familyName ? `${first} ${person.familyName}` : person.givenName);
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Up to two letters for an avatar: "Bob Lindqvist" → "BL". A letter is a whole grapheme, so a
// decomposed accent ("E" + U+0301) or a character outside the BMP isn't cut in half.
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => graphemes.segment(part)[Symbol.iterator]().next().value!.segment.toUpperCase())
    .join("");
}

export interface LocationSummary {
  // The home region, in the viewer's region format.
  region: string;
  // Shown as a badge after the region: the desk's seat code, or "Remote" without one.
  badge: string;
}

// Where someone is based: "Ontario, Canada [SF-2-003]", or "India [Remote]" without a desk.
export function locationSummary(person: DirectoryPerson): LocationSummary {
  return { region: person.homeRegionLabel, badge: person.desk?.name ?? "Remote" };
}

// The summary as plain text, for sorting and anywhere a badge can't be drawn.
export function locationText(person: DirectoryPerson): string {
  const { region, badge } = locationSummary(person);
  return `${region} ${badge}`;
}
