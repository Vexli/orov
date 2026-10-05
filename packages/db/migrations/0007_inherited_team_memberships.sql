CREATE TYPE "public"."membership_source" AS ENUM('explicit', 'inherited');--> statement-breakpoint
ALTER TABLE "team_member" ADD COLUMN "source" "membership_source" DEFAULT 'explicit' NOT NULL;--> statement-breakpoint
-- Added by hand: give existing members of sub-teams their inherited memberships of the teams
-- above. Later changes keep them in step through syncInheritedMemberships.
WITH RECURSIVE ancestor(person_id, team_id) AS (
  SELECT tm.person_id, t.parent_team_id
  FROM team_member tm JOIN team t ON t.id = tm.team_id
  WHERE t.parent_team_id IS NOT NULL
  UNION
  SELECT a.person_id, t.parent_team_id
  FROM ancestor a JOIN team t ON t.id = a.team_id
  WHERE t.parent_team_id IS NOT NULL
)
INSERT INTO "team_member" ("person_id", "team_id", "is_primary", "source")
SELECT DISTINCT person_id, team_id, false, 'inherited'::membership_source FROM ancestor
ON CONFLICT ("person_id", "team_id") DO NOTHING;
