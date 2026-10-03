import { sql } from "drizzle-orm";
import type { TeamRecord } from "@officeorg/core";
import type { Executor } from "../client";

// True if walking up the parent chain from `teamId` returns to `teamId`. Same UNION guard as
// hasManagerCycle.
export async function hasTeamCycle(db: Executor, teamId: string): Promise<boolean> {
  const result = await db.execute(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT parent_team_id FROM team WHERE id = ${teamId}
      UNION
      SELECT t.parent_team_id FROM team t JOIN chain c ON t.id = c.id WHERE c.id IS NOT NULL
    )
    SELECT 1 AS found FROM chain WHERE id = ${teamId}
  `);
  return result.rows.length > 0;
}

export async function loadTeamRecords(db: Executor): Promise<TeamRecord[]> {
  const rows = await db.query.team.findMany({
    with: { parent: { columns: { slug: true } } },
    orderBy: (t, { asc }) => [asc(t.slug)],
  });
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    parentSlug: row.parent?.slug ?? null,
    slackChannelId: row.slackChannelId,
    color: row.color,
  }));
}
