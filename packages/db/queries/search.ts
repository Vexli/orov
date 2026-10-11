import {
  aliasedTable,
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  containsPattern,
  EMPTY_SEARCH,
  normalizeQuery,
  type SearchResults,
  type SearchRoom,
} from "@orov/core/search/model";
import type { Executor } from "../client";
import * as s from "../schema";

// Below this pg_trgm word similarity a name isn't a fuzzy match. A typo in a longer word scores
// well above it ("lindqvst" 0.67, "recruting" 0.62, "worksop" 0.63), while words that only share
// their first letters stay out ("board" against "Phone Booth" scores 0.33). Typos in very short
// queries ("jne") score too low to tell from noise; a correct prefix still finds those.
const FUZZY = 0.45;

// The ⌘K search (plan.md §7). A name containing the query always matches; pg_trgm adds typo
// tolerance. Names that start with the query rank first, then the closest fuzzy matches.
export async function search(db: Executor, rawQuery: string, limit = 6): Promise<SearchResults> {
  const q = normalizeQuery(rawQuery);
  if (!q) return EMPTY_SEARCH;
  const contains = containsPattern(q);
  const prefix = contains.slice(1);
  // Rank 1 when the text starts with the query. ILIKE on a null column is null, and DESC sorts
  // nulls first, so the result is coalesced to false.
  const startsWith = (...columns: SQLWrapper[]): SQL<boolean> =>
    sql`coalesce(${sql.join(
      columns.map((c) => sql`${c} ilike ${prefix}`),
      sql` or `,
    )}, false)`;
  const fuzzy = (column: AnyPgColumn) =>
    sql<number>`word_similarity(${q}, coalesce(${column}, ''))`;

  const personScore = sql<number>`greatest(${fuzzy(s.person.name)}, ${fuzzy(s.person.preferredName)}, ${fuzzy(s.person.email)})`;
  const peopleQuery = db
    .select({
      id: s.person.id,
      name: s.person.name,
      preferredName: s.person.preferredName,
      title: s.person.title,
      desk: s.space.name,
    })
    .from(s.person)
    .leftJoin(s.space, eq(s.space.id, s.person.assignedDeskId))
    .where(
      and(
        eq(s.person.active, true),
        or(
          ilike(s.person.name, contains),
          ilike(s.person.preferredName, contains),
          ilike(s.person.email, contains),
          ilike(s.person.title, contains),
          sql`${personScore} >= ${FUZZY}`,
        ),
      ),
    )
    .orderBy(
      desc(startsWith(s.person.name, s.person.preferredName)),
      desc(personScore),
      asc(s.person.name),
    )
    .limit(limit);

  const parent = aliasedTable(s.team, "parent");
  const teamScore = fuzzy(s.team.name);
  const teamsQuery = db
    .select({ id: s.team.id, name: s.team.name, parentName: parent.name })
    .from(s.team)
    .leftJoin(parent, eq(parent.id, s.team.parentTeamId))
    .where(
      or(ilike(s.team.name, contains), ilike(s.team.slug, contains), sql`${teamScore} >= ${FUZZY}`),
    )
    .orderBy(desc(startsWith(s.team.name)), desc(teamScore), asc(s.team.name))
    .limit(limit);

  // Rooms people look for by name: meeting rooms and phone booths on floors still in use.
  const roomScore = fuzzy(s.space.name);
  const roomsQuery = db
    .select({
      id: s.space.id,
      name: s.space.name,
      kind: s.space.kind,
      locationSlug: s.location.slug,
      locationName: s.location.name,
      floorSlug: s.floor.slug,
      floorName: s.floor.name,
    })
    .from(s.space)
    .innerJoin(s.floor, eq(s.floor.id, s.space.floorId))
    .innerJoin(s.location, eq(s.location.id, s.floor.locationId))
    .where(
      and(
        inArray(s.space.kind, ["meeting_room", "phone_booth"]),
        isNull(s.space.archivedAt),
        isNull(s.floor.archivedAt),
        or(ilike(s.space.name, contains), sql`${roomScore} >= ${FUZZY}`),
      ),
    )
    .orderBy(desc(startsWith(s.space.name)), desc(roomScore), asc(s.space.name))
    .limit(limit);

  const [people, teams, rooms] = await Promise.all([peopleQuery, teamsQuery, roomsQuery]);
  return {
    people: people.map((p) => ({
      id: p.id,
      name: p.preferredName ?? p.name,
      title: p.title,
      desk: p.desk,
    })),
    teams,
    // The WHERE clause keeps only these two kinds.
    rooms: rooms as SearchRoom[],
  };
}
