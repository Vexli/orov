// The global search (⌘K, plan.md §7): one endpoint for people, teams and rooms.

export interface SearchPerson {
  id: string;
  name: string;
  title: string | null;
  // The desk code, for example "SF-2-014".
  desk: string | null;
}

export interface SearchTeam {
  id: string;
  name: string;
  parentName: string | null;
}

export interface SearchRoom {
  id: string;
  name: string;
  kind: "meeting_room" | "phone_booth";
  locationSlug: string;
  locationName: string;
  floorSlug: string;
  floorName: string;
}

export interface SearchResults {
  people: SearchPerson[];
  teams: SearchTeam[];
  rooms: SearchRoom[];
}

export const EMPTY_SEARCH: SearchResults = { people: [], teams: [], rooms: [] };

export const MAX_QUERY_LENGTH = 100;

// Trimmed, single-spaced and capped. An empty result means "don't search".
export function normalizeQuery(q: string | null | undefined): string {
  return (q ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
}

// A "contains" pattern for ILIKE, with the wildcards in the query taken literally, so a search
// for "50%" doesn't match everything.
export function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
