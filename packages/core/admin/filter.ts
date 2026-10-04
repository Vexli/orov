import { matchesQuery, teamScope } from "../directory/filter";

// Filters for the admin people and teams lists. Pure, so they run in the browser on the rows the
// server sent, and in tests.

export const PERSON_STATUSES = ["active", "inactive", "all"] as const;
export type PersonStatus = (typeof PERSON_STATUSES)[number];

export const DESK_FILTERS = ["any", "with", "without"] as const;
export type DeskFilter = (typeof DESK_FILTERS)[number];

// The fields of an admin list row the filters read.
export interface AdminPersonRow {
  name: string;
  email: string;
  title: string | null;
  managerName: string | null;
  deskName: string | null;
  active: boolean;
  teams: { id: string }[];
}

export interface AdminPeopleFilters {
  // Matched against name, email, title, manager and desk.
  q: string;
  teamId: string | null;
  includeSubteams: boolean;
  status: PersonStatus;
  desk: DeskFilter;
}

export const DEFAULT_ADMIN_PEOPLE_FILTERS: AdminPeopleFilters = {
  q: "",
  teamId: null,
  includeSubteams: true,
  status: "active",
  desk: "any",
};

export function filterAdminPeople<R extends AdminPersonRow>(
  rows: R[],
  filters: AdminPeopleFilters,
  teams: { id: string; parentTeamId: string | null }[],
): R[] {
  const scope = filters.teamId ? teamScope(filters.teamId, filters.includeSubteams, teams) : null;
  return rows.filter((p) => {
    if (filters.status === "active" && !p.active) return false;
    if (filters.status === "inactive" && p.active) return false;
    if (filters.desk === "with" && !p.deskName) return false;
    if (filters.desk === "without" && p.deskName) return false;
    if (scope && !p.teams.some((t) => scope.has(t.id))) return false;
    return matchesQuery([p.name, p.email, p.title, p.managerName, p.deskName], filters.q);
  });
}

export interface AdminTeamRow {
  id: string;
  name: string;
  slug: string;
  parentTeamId: string | null;
}

// Teams whose name or slug matches, plus their ancestors, so a nested match still shows under
// its parents. `matched` tells the two apart. A blank query keeps every team.
export function filterAdminTeams(
  rows: AdminTeamRow[],
  q: string,
): { visible: Set<string>; matched: Set<string> } {
  const matched = new Set(rows.filter((t) => matchesQuery([t.name, t.slug], q)).map((t) => t.id));
  const byId = new Map(rows.map((t) => [t.id, t]));
  const visible = new Set<string>();
  for (const id of matched) {
    let current: string | null = id;
    // The visited check stops a cycle in the data from looping.
    while (current && !visible.has(current)) {
      visible.add(current);
      current = byId.get(current)?.parentTeamId ?? null;
    }
  }
  return { visible, matched };
}
