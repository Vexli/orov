import { eq, isNotNull, inArray } from "drizzle-orm";
import {
  parsePeopleCsv,
  parseTeamsCsv,
  peopleToCsv,
  planPeopleImport,
  planTeamsImport,
  teamsToCsv,
  type DeskInfo,
  type ImportPlan,
  type PeopleSnapshot,
  type PersonRecord,
  type TeamRecord,
} from "@officeorg/core";
import type { Database, Executor } from "../client";
import * as s from "../schema";
import { recordAudit } from "./audit";
import { hasManagerCycle, loadPersonRecords, writeProfileIdentities } from "./people";
import { hasTeamCycle, loadTeamRecords } from "./teams";

export class ImportRejectedError extends Error {
  constructor(
    message: string,
    readonly plan?: ImportPlan<unknown>,
  ) {
    super(message);
    this.name = "ImportRejectedError";
  }
}

// Names the first bad row, so the admin sees the reason in the error and not just "has errors".
function rejectionFor(plan: ImportPlan<unknown>): ImportRejectedError {
  const first = plan.rows.find((r) => r.action === "error");
  const reason = first ? ` First problem, line ${first.line}: ${first.message}` : "";
  return new ImportRejectedError(`The file has errors, so nothing was imported.${reason}`, plan);
}

export type PlanResult<R> = { ok: true; plan: ImportPlan<R> } | { ok: false; fatal: string };

export interface ApplyResult {
  created: number;
  updated: number;
  unchanged: number;
}

async function loadPeopleSnapshot(db: Executor): Promise<PeopleSnapshot> {
  const people = await loadPersonRecords(db);
  const teams = await loadTeamRecords(db);

  const deskRows = await db.query.space.findMany({
    where: eq(s.space.kind, "desk"),
    with: { floor: { columns: { archivedAt: true }, with: { location: { columns: { timezone: true } } } } },
  });
  const owners = await db
    .select({ email: s.person.email, deskId: s.person.assignedDeskId })
    .from(s.person)
    .where(isNotNull(s.person.assignedDeskId));
  const ownerByDeskId = new Map(owners.map((o) => [o.deskId, o.email]));

  const desks = new Map<string, DeskInfo>();
  for (const desk of deskRows) {
    desks.set(desk.name, {
      assignable: desk.archivedAt === null && desk.floor.archivedAt === null,
      ownerEmail: ownerByDeskId.get(desk.id) ?? null,
      timezone: desk.floor.location.timezone,
    });
  }

  return {
    people: new Map(people.map((p) => [p.email, p])),
    teamSlugs: new Set(teams.map((t) => t.slug)),
    desks,
  };
}

export async function planPeopleCsv(db: Executor, text: string): Promise<PlanResult<PersonRecord>> {
  const parsed = parsePeopleCsv(text);
  if (parsed.fatal) return { ok: false, fatal: parsed.fatal };
  const snapshot = await loadPeopleSnapshot(db);
  return { ok: true, plan: planPeopleImport(parsed.rows, parsed.issues, snapshot) };
}

// Re-plans inside the transaction, so the result reflects the database at write time rather than
// whatever the dry run saw. Writes happen in three passes:
//   1. Upsert every changed person with no manager and no desk. This clears the desk of anyone
//      who is moving, so two people can swap desks without hitting the unique index.
//      It also clears their profile accounts, so two people can swap one the same way.
//   2. Set managers, desks, team memberships and accounts, now that every referenced person exists.
//   3. Check each changed person for a manager cycle.
export async function applyPeopleCsv(
  db: Database,
  actorEmail: string,
  text: string,
): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const planned = await planPeopleCsv(tx, text);
    if (!planned.ok) throw new ImportRejectedError(planned.fatal);
    if (!planned.plan.canApply) throw rejectionFor(planned.plan);
    const snapshot = await loadPeopleSnapshot(tx);
    const changed = planned.plan.rows.filter((r) => r.action === "create" || r.action === "update");

    for (const row of changed) {
      const rec = row.record!;
      await tx
        .insert(s.person)
        .values(personValues(rec))
        .onConflictDoUpdate({
          target: s.person.email,
          set: { ...personValues(rec), managerId: null, assignedDeskId: null, updatedAt: new Date() },
        });
    }

    const idByEmail = new Map(
      (await tx.select({ id: s.person.id, email: s.person.email }).from(s.person)).map((p) => [p.email, p.id]),
    );
    const idByDeskCode = new Map(
      (
        await tx
          .select({ id: s.space.id, name: s.space.name })
          .from(s.space)
          .where(eq(s.space.kind, "desk"))
      ).map((d) => [d.name, d.id]),
    );

    for (const row of changed) {
      await writeProfileIdentities(tx, idByEmail.get(row.record!.email)!, {});
    }

    for (const row of changed) {
      const rec = row.record!;
      const personId = idByEmail.get(rec.email)!;

      await writeProfileIdentities(tx, personId, rec.identities);
      await tx.delete(s.teamMember).where(eq(s.teamMember.personId, personId));
      if (rec.teamSlugs.length > 0) {
        const teamIds = await tx
          .select({ id: s.team.id, slug: s.team.slug })
          .from(s.team)
          .where(inArray(s.team.slug, rec.teamSlugs));
        const teamIdBySlug = new Map(teamIds.map((t) => [t.slug, t.id]));
        await tx.insert(s.teamMember).values(
          rec.teamSlugs.map((slug) => ({
            personId,
            teamId: teamIdBySlug.get(slug)!,
            isPrimary: slug === rec.primaryTeamSlug,
          })),
        );
      }

      await tx
        .update(s.person)
        .set({
          managerId: rec.managerEmail ? (idByEmail.get(rec.managerEmail) ?? null) : null,
          assignedDeskId: rec.deskCode ? (idByDeskCode.get(rec.deskCode) ?? null) : null,
        })
        .where(eq(s.person.id, personId));
    }

    for (const row of changed) {
      const personId = idByEmail.get(row.record!.email)!;
      if (await hasManagerCycle(tx, personId)) {
        throw new ImportRejectedError(`manager chain loops back to ${row.record!.email}`);
      }
      await recordAudit(tx, actorEmail, {
        entity: "person",
        entityId: personId,
        action: row.action === "create" ? "create" : "update",
        before: row.action === "update" ? snapshot.people.get(row.record!.email) : null,
        after: row.record,
      });
    }

    return {
      created: planned.plan.counts.create,
      updated: planned.plan.counts.update,
      unchanged: planned.plan.counts.unchanged,
    };
  });
}

function personValues(rec: PersonRecord) {
  return {
    email: rec.email,
    name: rec.name,
    preferredName: rec.preferredName,
    title: rec.title,
    phone: rec.phone,
    homeRegion: rec.homeRegion,
    homeTimezone: rec.homeTimezone,
    startDate: rec.startDate,
    active: rec.active,
  };
}

export async function planTeamsCsv(db: Executor, text: string): Promise<PlanResult<TeamRecord>> {
  const parsed = parseTeamsCsv(text);
  if (parsed.fatal) return { ok: false, fatal: parsed.fatal };
  const existing = new Map((await loadTeamRecords(db)).map((t) => [t.slug, t]));
  return { ok: true, plan: planTeamsImport(parsed.rows, parsed.issues, existing) };
}

// Same three-pass shape as applyPeopleCsv. Team leads are not part of the spreadsheet, so an
// import never changes them.
export async function applyTeamsCsv(db: Database, actorEmail: string, text: string): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const planned = await planTeamsCsv(tx, text);
    if (!planned.ok) throw new ImportRejectedError(planned.fatal);
    if (!planned.plan.canApply) throw rejectionFor(planned.plan);
    const existing = new Map((await loadTeamRecords(tx)).map((t) => [t.slug, t]));
    const changed = planned.plan.rows.filter((r) => r.action === "create" || r.action === "update");

    for (const row of changed) {
      const rec = row.record!;
      const values = {
        slug: rec.slug,
        name: rec.name,
        chatChannelId: rec.chatChannelId,
        color: rec.color,
      };
      await tx
        .insert(s.team)
        .values({ ...values, parentTeamId: null })
        .onConflictDoUpdate({ target: s.team.slug, set: { ...values, parentTeamId: null } });
    }

    const idBySlug = new Map((await tx.select({ id: s.team.id, slug: s.team.slug }).from(s.team)).map((t) => [t.slug, t.id]));
    for (const row of changed) {
      const rec = row.record!;
      await tx
        .update(s.team)
        .set({ parentTeamId: rec.parentSlug ? (idBySlug.get(rec.parentSlug) ?? null) : null })
        .where(eq(s.team.slug, rec.slug));
    }

    for (const row of changed) {
      const teamId = idBySlug.get(row.record!.slug)!;
      if (await hasTeamCycle(tx, teamId)) {
        throw new ImportRejectedError(`parent chain loops back to ${row.record!.slug}`);
      }
      await recordAudit(tx, actorEmail, {
        entity: "team",
        entityId: teamId,
        action: row.action === "create" ? "create" : "update",
        before: row.action === "update" ? existing.get(row.record!.slug) : null,
        after: row.record,
      });
    }

    return {
      created: planned.plan.counts.create,
      updated: planned.plan.counts.update,
      unchanged: planned.plan.counts.unchanged,
    };
  });
}

export async function exportPeopleCsv(db: Executor): Promise<string> {
  return peopleToCsv(await loadPersonRecords(db));
}

export async function exportTeamsCsv(db: Executor): Promise<string> {
  return teamsToCsv(await loadTeamRecords(db));
}
