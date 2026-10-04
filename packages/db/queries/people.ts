import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  applyBulkPatch,
  type BulkPatch,
  compareByFamilyName,
  defaultTimeZone,
  identityProvider,
  inheritedManager,
  PROFILE_PROVIDER_IDS,
  type Identities,
  type PersonForm,
  type PersonRecord,
} from "@officeorg/core";
import type { Database, Executor } from "../client";
import * as s from "../schema";
import { recordAudit } from "./audit";
import { syncInheritedMemberships } from "./memberships";
import { ValidationError } from "./errors";

// True if walking up the manager chain from `personId` returns to `personId`.
// UNION rather than UNION ALL stops the walk even if the existing data already contains a cycle.
export async function hasManagerCycle(db: Executor, personId: string): Promise<boolean> {
  const result = await db.execute(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT manager_id FROM person WHERE id = ${personId}
      UNION
      SELECT p.manager_id FROM person p JOIN chain c ON p.id = c.id WHERE c.id IS NOT NULL
    )
    SELECT 1 AS found FROM chain WHERE id = ${personId}
  `);
  return result.rows.length > 0;
}

// Checks before a write: would making `newManagerId` the manager of `personId` close a loop?
// Walks up from the proposed manager and sees whether it reaches the person.
export async function managerWouldLoop(
  db: Executor,
  personId: string,
  newManagerId: string,
): Promise<boolean> {
  if (newManagerId === personId) return true;
  const result = await db.execute(sql`
    WITH RECURSIVE chain(id) AS (
      SELECT ${newManagerId}::text
      UNION
      SELECT p.manager_id FROM person p JOIN chain c ON p.id = c.id WHERE c.id IS NOT NULL
    )
    SELECT 1 AS found FROM chain WHERE id = ${personId}
  `);
  return result.rows.length > 0;
}

const personWith = {
  manager: { columns: { email: true } },
  assignedDesk: { columns: { name: true } },
  teamMembers: { with: { team: { columns: { slug: true } } } },
  identities: { columns: { provider: true, value: true } },
} as const;

type PersonRow = NonNullable<Awaited<ReturnType<typeof findPersonRow>>>;

async function findPersonRow(db: Executor, id: string) {
  return db.query.person.findFirst({ where: eq(s.person.id, id), with: personWith });
}

function toPersonRecord(row: PersonRow): PersonRecord {
  return {
    email: row.email,
    givenName: row.givenName,
    familyName: row.familyName,
    preferredName: row.preferredName,
    title: row.title,
    phone: row.phone,
    homeRegion: row.homeRegion,
    homeTimezone: row.homeTimezone,
    startDate: row.startDate,
    active: row.active,
    managerEmail: row.manager?.email ?? null,
    deskCode: row.assignedDesk?.name ?? null,
    // Explicit memberships only: inherited ones follow from these, so the spreadsheet holds what
    // was chosen and a re-import is stable.
    teamSlugs: row.teamMembers.filter((m) => m.source === "explicit").map((m) => m.team.slug).sort(),
    primaryTeamSlug: row.teamMembers.find((m) => m.isPrimary)?.team.slug ?? null,
    identities: profileIdentities(row.identities),
  };
}

// The profile accounts among a person's identity rows. Messaging ids aren't spreadsheet data.
export function profileIdentities(rows: { provider: string; value: string }[]): Identities {
  const identities: Identities = {};
  for (const { provider, value } of rows) {
    if (PROFILE_PROVIDER_IDS.includes(provider)) identities[provider] = value;
  }
  return identities;
}

// Replaces a person's profile accounts. Callers check for accounts held by someone else first;
// the unique index is the backstop.
export async function writeProfileIdentities(tx: Executor, personId: string, identities: Identities) {
  await tx
    .delete(s.personIdentity)
    .where(and(eq(s.personIdentity.personId, personId), inArray(s.personIdentity.provider, PROFILE_PROVIDER_IDS)));
  const rows = Object.entries(identities).map(([provider, value]) => ({ personId, provider, value }));
  if (rows.length > 0) await tx.insert(s.personIdentity).values(rows);
}

// Loads everyone in the spreadsheet vocabulary: references by email, slug and desk code.
export async function loadPersonRecords(db: Executor): Promise<PersonRecord[]> {
  const rows = await db.query.person.findMany({
    with: personWith,
    orderBy: (p, { asc }) => [asc(p.email)],
  });
  return rows.map(toPersonRecord);
}

export async function loadPersonRecord(db: Executor, id: string): Promise<PersonRecord | null> {
  const row = await findPersonRow(db, id);
  return row ? toPersonRecord(row) : null;
}

// Rows for the admin list and the manager picker, by family name. Team membership is included.
export async function listPeopleForAdmin(db: Executor) {
  const rows = await db.query.person.findMany({
    with: {
      manager: { columns: { id: true, name: true } },
      assignedDesk: { columns: { id: true, name: true } },
      teamMembers: { with: { team: { columns: { slug: true, name: true } } } },
    },
  });
  return rows.sort(compareByFamilyName).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    title: row.title,
    phone: row.phone,
    active: row.active,
    managerId: row.manager?.id ?? null,
    managerName: row.manager?.name ?? null,
    deskId: row.assignedDesk?.id ?? null,
    deskName: row.assignedDesk?.name ?? null,
    teams: row.teamMembers
      .map((m) => ({
        id: m.teamId,
        slug: m.team.slug,
        name: m.team.name,
        isPrimary: m.isPrimary,
        inherited: m.source === "inherited",
      }))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name)),
  }));
}

// Values for the edit form, with ids where the form uses selects.
export async function getPersonForEdit(db: Executor, id: string): Promise<PersonForm | null> {
  const row = await db.query.person.findFirst({
    where: eq(s.person.id, id),
    with: { teamMembers: true, identities: true },
  });
  if (!row) return null;
  return {
    email: row.email,
    givenName: row.givenName,
    familyName: row.familyName,
    preferredName: row.preferredName,
    title: row.title,
    phone: row.phone,
    homeRegion: row.homeRegion,
    homeTimezone: row.homeTimezone,
    startDate: row.startDate,
    active: row.active,
    managerId: row.managerId,
    assignedDeskId: row.assignedDeskId,
    teamIds: row.teamMembers.filter((m) => m.source === "explicit").map((m) => m.teamId),
    primaryTeamId: row.teamMembers.find((m) => m.isPrimary)?.teamId ?? null,
    identities: profileIdentities(row.identities),
  };
}

// Creates or updates a person. Every check runs inside the same transaction as the write.
export async function savePerson(
  db: Database,
  actorEmail: string,
  input: PersonForm,
  id?: string,
): Promise<{ id: string }> {
  return db.transaction((tx) => savePersonIn(tx, actorEmail, input, id));
}

// savePerson's checks and writes, inside a transaction the caller holds (bulkUpdatePeople runs
// several in one).
async function savePersonIn(
  tx: Executor,
  actorEmail: string,
  input: PersonForm,
  id?: string,
): Promise<{ id: string }> {
  const before = id ? await loadPersonRecord(tx, id) : null;
  if (id && !before) throw new ValidationError("This person no longer exists.");

  const emailTaken = await tx.query.person.findFirst({
    where: and(eq(s.person.email, input.email), id ? ne(s.person.id, id) : undefined),
    columns: { id: true },
  });
  if (emailTaken) throw new ValidationError("Another person already uses this email.", "email");

  // No manager chosen: the primary team's lead (#11), unless that would close a loop.
  let managerId = input.managerId;
  if (managerId === null && input.primaryTeamId !== null) {
    const teams = await tx.select({ id: s.team.id, parentTeamId: s.team.parentTeamId, leadId: s.team.leadId }).from(s.team);
    const lead = inheritedManager(id ?? "", input.primaryTeamId, new Map(teams.map((t) => [t.id, t])));
    if (lead && !(id && (await managerWouldLoop(tx, id, lead)))) managerId = lead;
  }

  if (managerId) {
    const manager = await tx.query.person.findFirst({ where: eq(s.person.id, managerId), columns: { id: true } });
    if (!manager) throw new ValidationError("Choose an existing manager.", "managerId");
    if (id && (await managerWouldLoop(tx, id, managerId))) {
      throw new ValidationError("That manager reports (directly or not) to this person, which would create a loop.", "managerId");
    }
  }

  const holder = input.assignedDeskId
    ? await checkDesk(tx, input.assignedDeskId, id ?? null, input.swapDesk === true)
    : null;

  if (input.teamIds.length > 0) {
    const found = await tx.query.team.findMany({ where: inArray(s.team.id, input.teamIds), columns: { id: true } });
    if (found.length !== new Set(input.teamIds).size) {
      throw new ValidationError("One of the selected teams no longer exists.", "teamIds");
    }
  }

  for (const [provider, value] of Object.entries(input.identities)) {
    const holder = await tx
      .select({ name: s.person.name })
      .from(s.personIdentity)
      .innerJoin(s.person, eq(s.person.id, s.personIdentity.personId))
      .where(
        and(
          eq(s.personIdentity.provider, provider),
          eq(s.personIdentity.value, value),
          id ? ne(s.personIdentity.personId, id) : undefined,
        ),
      );
    if (holder[0]) {
      const label = identityProvider(provider)?.label ?? provider;
      throw new ValidationError(`${holder[0].name} already has this ${label} account.`, `identities.${provider}`);
    }
  }

  const values = {
    email: input.email,
    givenName: input.givenName,
    familyName: input.familyName,
    preferredName: input.preferredName,
    title: input.title,
    phone: input.phone,
    homeRegion: input.homeRegion,
    homeTimezone: defaultTimeZone(
      input.homeTimezone,
      input.assignedDeskId ? await deskTimeZone(tx, input.assignedDeskId) : null,
    ),
    startDate: input.startDate,
    active: input.active,
    managerId,
    assignedDeskId: input.assignedDeskId,
    updatedAt: new Date(),
  };

  // A swap: the holder takes this person's old desk, or becomes deskless if there wasn't one.
  // One desk, one person is a unique index, so the holder lets go first and moves last.
  const previousDeskId = id
    ? ((await tx.query.person.findFirst({ where: eq(s.person.id, id), columns: { assignedDeskId: true } }))
        ?.assignedDeskId ?? null)
    : null;
  const holderBefore = holder ? await loadPersonRecord(tx, holder.id) : null;
  if (holder) await tx.update(s.person).set({ assignedDeskId: null }).where(eq(s.person.id, holder.id));

  const personId = id
    ? (await tx.update(s.person).set(values).where(eq(s.person.id, id)).returning({ id: s.person.id }))[0]!.id
    : (await tx.insert(s.person).values(values).returning({ id: s.person.id }))[0]!.id;

  if (holder) {
    await tx
      .update(s.person)
      .set({ assignedDeskId: previousDeskId, updatedAt: new Date() })
      .where(eq(s.person.id, holder.id));
    const holderAfter = await loadPersonRecord(tx, holder.id);
    await recordAudit(tx, actorEmail, { entity: "person", entityId: holder.id, action: "update", before: holderBefore, after: holderAfter });
  }

  await tx.delete(s.teamMember).where(eq(s.teamMember.personId, personId));
  if (input.teamIds.length > 0) {
    await tx.insert(s.teamMember).values(
      input.teamIds.map((teamId) => ({
        personId,
        teamId,
        isPrimary: teamId === input.primaryTeamId,
      })),
    );
  }

  await writeProfileIdentities(tx, personId, input.identities);
  await syncInheritedMemberships(tx);

  const after = await loadPersonRecord(tx, personId);
  await recordAudit(tx, actorEmail, {
    entity: "person",
    entityId: personId,
    action: id ? "update" : "create",
    before,
    after,
  });
  return { id: personId };
}

async function deskTimeZone(tx: Executor, deskId: string): Promise<string | null> {
  const [row] = await tx
    .select({ timezone: s.location.timezone })
    .from(s.space)
    .innerJoin(s.floor, eq(s.floor.id, s.space.floorId))
    .innerJoin(s.location, eq(s.location.id, s.floor.locationId))
    .where(eq(s.space.id, deskId));
  return row?.timezone ?? null;
}

// Applies one change to several people (#7) in a single transaction: each person goes through
// the same checks and writes as a single edit (savePersonIn), with an audit entry each. If any
// of them fails, nothing is saved, and the error names the person. People are saved one after
// another, so a manager who reports to someone earlier in the batch is caught as a loop too.
export async function bulkUpdatePeople(
  db: Database,
  actorEmail: string,
  ids: readonly string[],
  patch: BulkPatch,
): Promise<{ updated: number }> {
  return db.transaction(async (tx) => {
    for (const id of new Set(ids)) {
      const form = await getPersonForEdit(tx, id);
      if (!form) throw new ValidationError("One of the selected people no longer exists.");
      try {
        await savePersonIn(tx, actorEmail, applyBulkPatch(form, patch), id);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        const name = (await tx.query.person.findFirst({ where: eq(s.person.id, id), columns: { name: true } }))?.name;
        throw new ValidationError(`${name ?? id}: ${error.message} Nothing was changed.`);
      }
    }
    return { updated: new Set(ids).size };
  });
}

// Checks the desk can be assigned. If someone else holds it, returns them when the admin asked
// to swap, and rejects the save otherwise.
async function checkDesk(tx: Executor, deskId: string, personId: string | null, swap: boolean) {
  const desk = await tx.query.space.findFirst({
    where: eq(s.space.id, deskId),
    with: { floor: { columns: { archivedAt: true } } },
  });
  if (!desk) throw new ValidationError("Choose an existing seat.", "assignedDeskId");
  if (desk.kind !== "desk") throw new ValidationError(`${desk.name} is not a desk.`, "assignedDeskId");
  if (desk.archivedAt || desk.floor.archivedAt) {
    throw new ValidationError(`${desk.name} is archived.`, "assignedDeskId");
  }
  const holder = await tx.query.person.findFirst({
    where: and(eq(s.person.assignedDeskId, deskId), personId ? ne(s.person.id, personId) : undefined),
    columns: { id: true, name: true },
  });
  if (holder && !swap) {
    throw new ValidationError(
      `${desk.name} is already assigned to ${holder.name}. Swap desks with them, or pick another desk.`,
      "assignedDeskId",
    );
  }
  return holder ?? null;
}

// Deactivation is a flag, not a delete. History and the audit trail keep pointing at the person.
export async function setPersonActive(db: Database, actorEmail: string, id: string, active: boolean) {
  return db.transaction(async (tx) => {
    const before = await loadPersonRecord(tx, id);
    if (!before) throw new ValidationError("This person no longer exists.");
    await tx.update(s.person).set({ active, updatedAt: new Date() }).where(eq(s.person.id, id));
    const after = await loadPersonRecord(tx, id);
    await recordAudit(tx, actorEmail, { entity: "person", entityId: id, action: "update", before, after });
  });
}

