import { sql } from "drizzle-orm";
import type { Executor } from "../client";

// Rebuilds every inherited membership (#23) from the explicit ones: each member of a team is an
// inherited, non-primary member of every team above it that they haven't joined themselves.
// Inherited rows are derived data, so any write that changes someone's teams or moves a team
// in the tree calls this before committing. Rebuilding them all is cheap at this size, and
// can't miss a case the way patching individual rows could.
export async function syncInheritedMemberships(db: Executor): Promise<void> {
  await db.execute(sql`DELETE FROM team_member WHERE source = 'inherited'`);
  await db.execute(sql`
    WITH RECURSIVE ancestor(person_id, team_id) AS (
      SELECT tm.person_id, t.parent_team_id
      FROM team_member tm JOIN team t ON t.id = tm.team_id
      WHERE tm.source = 'explicit' AND t.parent_team_id IS NOT NULL
      UNION
      SELECT a.person_id, t.parent_team_id
      FROM ancestor a JOIN team t ON t.id = a.team_id
      WHERE t.parent_team_id IS NOT NULL
    )
    INSERT INTO team_member (person_id, team_id, is_primary, source)
    SELECT DISTINCT person_id, team_id, false, 'inherited'::membership_source FROM ancestor
    ON CONFLICT (person_id, team_id) DO NOTHING
  `);
}
