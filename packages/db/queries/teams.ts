import { and, eq, ne, sql } from "drizzle-orm";
import type { TeamForm, TeamRecord } from "@orov/core";
import type { Database, Executor } from "../client";
import * as s from "../schema";
import { recordAudit } from "./audit";
import { syncInheritedMemberships } from "./memberships";
import { ValidationError } from "./errors";

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

// Checks before a write: would making `newParentId` the parent of `teamId` close a loop?
export async function teamWouldLoop(db: Executor, teamId: string, newParentId: string): Promise<boolean> {
  if (newParentId === teamId) return true;
  const result = await db.execute(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT ${newParentId}::text
      UNION
      SELECT t.parent_team_id FROM team t JOIN chain c ON t.id = c.id WHERE c.id IS NOT NULL
    )
    SELECT 1 AS found FROM chain WHERE id = ${teamId}
  `);
  return result.rows.length > 0;
}

const teamWith = { parent: { columns: { slug: true } } } as const;

async function findTeamRow(db: Executor, id: string) {
  return db.query.team.findFirst({ where: eq(s.team.id, id), with: teamWith });
}

function toTeamRecord(row: NonNullable<Awaited<ReturnType<typeof findTeamRow>>>): TeamRecord {
  return {
    slug: row.slug,
    name: row.name,
    parentSlug: row.parent?.slug ?? null,
    chatChannelId: row.chatChannelId,
    color: row.color,
  };
}

export async function loadTeamRecords(db: Executor): Promise<TeamRecord[]> {
  const rows = await db.query.team.findMany({
    with: teamWith,
    orderBy: (t, { asc }) => [asc(t.slug)],
  });
  return rows.map(toTeamRecord);
}

async function loadTeamRecord(db: Executor, id: string): Promise<TeamRecord | null> {
  const row = await findTeamRow(db, id);
  return row ? toTeamRecord(row) : null;
}

// Rows for the admin tree: parent, lead, and how many people and child teams hang off each team.
export async function listTeamsForAdmin(db: Executor) {
  const rows = await db.query.team.findMany({
    with: {
      parent: { columns: { id: true, name: true } },
      lead: { columns: { id: true, name: true } },
      members: { columns: { personId: true } },
      children: { columns: { id: true } },
    },
    orderBy: (t, { asc }) => [asc(t.name)],
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentTeamId: row.parent?.id ?? null,
    parentName: row.parent?.name ?? null,
    leadId: row.lead?.id ?? null,
    leadName: row.lead?.name ?? null,
    chatChannelId: row.chatChannelId,
    color: row.color,
    memberCount: row.members.length,
    childCount: row.children.length,
  }));
}

export async function getTeamForEdit(db: Executor, id: string): Promise<TeamForm | null> {
  const row = await db.query.team.findFirst({ where: eq(s.team.id, id) });
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name,
    parentTeamId: row.parentTeamId,
    leadId: row.leadId,
    chatChannelId: row.chatChannelId,
    color: row.color,
  };
}

export async function saveTeam(
  db: Database,
  actorEmail: string,
  input: TeamForm,
  id?: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const before = id ? await loadTeamRecord(tx, id) : null;
    if (id && !before) throw new ValidationError("This team no longer exists.");

    const slugTaken = await tx.query.team.findFirst({
      where: id ? and(eq(s.team.slug, input.slug), ne(s.team.id, id)) : eq(s.team.slug, input.slug),
      columns: { id: true },
    });
    if (slugTaken) throw new ValidationError("Another team already uses this slug.", "slug");

    if (input.parentTeamId) {
      const parent = await tx.query.team.findFirst({ where: eq(s.team.id, input.parentTeamId), columns: { id: true } });
      if (!parent) throw new ValidationError("Choose an existing parent team.", "parentTeamId");
      if (id && (await teamWouldLoop(tx, id, input.parentTeamId))) {
        throw new ValidationError("That team is a sub-team of this one, which would create a loop.", "parentTeamId");
      }
    }

    if (input.leadId) {
      const lead = await tx.query.person.findFirst({ where: eq(s.person.id, input.leadId), columns: { id: true } });
      if (!lead) throw new ValidationError("Choose an existing lead.", "leadId");
    }

    const values = {
      slug: input.slug,
      name: input.name,
      parentTeamId: input.parentTeamId,
      leadId: input.leadId,
      chatChannelId: input.chatChannelId,
      color: input.color,
    };
    const teamId = id
      ? (await tx.update(s.team).set(values).where(eq(s.team.id, id)).returning({ id: s.team.id }))[0]!.id
      : (await tx.insert(s.team).values(values).returning({ id: s.team.id }))[0]!.id;

    // Moving a team under another moves its members' inherited memberships too.
    await syncInheritedMemberships(tx);

    const after = await loadTeamRecord(tx, teamId);
    await recordAudit(tx, actorEmail, {
      entity: "team",
      entityId: teamId,
      action: id ? "update" : "create",
      before,
      after,
    });
    return { id: teamId };
  });
}

// Refused while the team has sub-teams or members. Deleting either would silently orphan people
// or hide a whole subtree, so the admin has to move them first.
export async function deleteTeam(db: Database, actorEmail: string, id: string): Promise<void> {
  return db.transaction(async (tx) => {
    const row = await tx.query.team.findFirst({
      where: eq(s.team.id, id),
      with: { children: { columns: { id: true } }, members: { columns: { personId: true } } },
    });
    if (!row) throw new ValidationError("This team no longer exists.");
    if (row.children.length > 0) {
      throw new ValidationError(`Move the ${row.children.length} sub-team(s) out of ${row.name} first.`);
    }
    if (row.members.length > 0) {
      throw new ValidationError(`Move the ${row.members.length} member(s) out of ${row.name} first.`);
    }
    const before = await loadTeamRecord(tx, id);
    await tx.delete(s.team).where(eq(s.team.id, id));
    await recordAudit(tx, actorEmail, { entity: "team", entityId: id, action: "delete", before, after: null });
  });
}
