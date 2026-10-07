import { and, asc, count, eq, gt, sql } from "drizzle-orm";
import {
  DEFAULT_UI_LOCALE,
  isBootstrapAdmin,
  isUiLocale,
  type DateFormat,
  type RegionDisplay,
  type UiLocale,
} from "@orov/core";
import type { Database, Executor } from "../client";
import { appUser, authSession, authUser, person } from "../schema";
import { recordAudit } from "./audit";
import { ValidationError } from "./errors";

export type AppRole = "viewer" | "admin";

// Called on every successful sign-in. A new person gets a viewer row. Someone on the bootstrap
// list is promoted to admin. Anyone else keeps the role the database already has, so an admin
// who was demoted by hand isn't re-promoted just by signing in.
export async function recordSignIn(
  db: Executor,
  email: string,
  bootstrapAdmin: boolean,
): Promise<AppRole> {
  const [row] = await db
    .insert(appUser)
    .values({
      email,
      role: bootstrapAdmin ? "admin" : "viewer",
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appUser.email,
      set: {
        role: bootstrapAdmin ? "admin" : sql`${appUser.role}`,
        lastSeenAt: new Date(),
      },
    })
    .returning({ role: appUser.role });
  if (!row) throw new Error(`failed to record sign-in for ${email}`);
  return row.role;
}

// Someone in the directory keeps access while they're active and not past their final date (N6),
// in the database's calendar (UTC). Someone with no directory entry, such as an ADMIN_EMAILS
// address, is judged by app_user alone.
const personMayAccess = sql`${person.active} AND (${person.endDate} IS NULL OR ${person.endDate} >= CURRENT_DATE)`;
// The same, for a query where person is left-joined and may be missing.
const personInGoodStanding = sql<boolean>`(${person.id} IS NULL OR (${personMayAccess}))`;

// Whether this email may sign in and use the app: not disabled by an admin, and in good standing
// in the directory. Checked before every session is created (admitSession) and, through
// getAppUser, on every request.
export async function hasAccess(db: Executor, email: string): Promise<boolean> {
  const result = await db.execute(sql`SELECT
    NOT EXISTS (SELECT 1 FROM ${appUser} WHERE ${appUser.email} = ${email} AND ${appUser.disabledAt} IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM ${person} WHERE ${person.email} = ${email} AND NOT (${personMayAccess}))
    AS ok`);
  return (result.rows[0] as { ok: boolean } | undefined)?.ok === true;
}

// The last check before Better Auth creates a session, whatever the sign-in method: the account's
// email must be on the company domain, and the person must still have access (hasAccess).
// Passing it records the sign-in, so the app_user row exists from the first request on. False
// refuses the session.
export async function admitSession(
  db: Executor,
  authUserId: string,
  policy: { companyDomain: string; adminEmails: readonly string[] },
): Promise<boolean> {
  const [row] = await db
    .select({ email: authUser.email })
    .from(authUser)
    .where(eq(authUser.id, authUserId));
  const email = row?.email.toLowerCase();
  if (!email || !email.endsWith(`@${policy.companyDomain.toLowerCase()}`)) return false;
  if (!(await hasAccess(db, email))) return false;
  await recordSignIn(db, email, isBootstrapAdmin(email, policy.adminEmails));
  return true;
}

export interface AppUser {
  role: AppRole;
  regionDisplay: RegionDisplay;
  regionFlag: boolean;
  dateFormat: DateFormat;
  locale: UiLocale;
}

// The role and personal settings in one read, for the session check every page makes.
// Returns null for an email with no row, a disabled user, or someone who is inactive or past
// their final date in the directory, all of which mean no access, from the next request on.
export async function getAppUser(db: Executor, email: string): Promise<AppUser | null> {
  const [row] = await db
    .select({
      role: appUser.role,
      regionDisplay: appUser.regionDisplay,
      regionFlag: appUser.regionFlag,
      dateFormat: appUser.dateFormat,
      locale: appUser.locale,
    })
    .from(appUser)
    .leftJoin(person, eq(person.email, appUser.email))
    .where(and(eq(appUser.email, email), sql`${appUser.disabledAt} IS NULL`, personInGoodStanding));
  // A language dropped from UI_LOCALES falls back to the default rather than failing.
  return row ? { ...row, locale: isUiLocale(row.locale) ? row.locale : DEFAULT_UI_LOCALE } : null;
}

export type UserSettings = Pick<AppUser, "regionDisplay" | "regionFlag" | "dateFormat" | "locale">;

// A user's own preferences; fields left out keep their value. Not audited: they change only
// what that user sees.
export async function setUserSettings(
  db: Executor,
  email: string,
  settings: Partial<UserSettings>,
): Promise<void> {
  if (Object.keys(settings).length === 0) return;
  await db.update(appUser).set(settings).where(eq(appUser.email, email));
}

// Authoritative role lookup. Returns null for an email with no row, which means no access.
export async function getAppRole(db: Executor, email: string): Promise<AppRole | null> {
  const row = await db.query.appUser.findFirst({
    where: eq(appUser.email, email),
    columns: { role: true },
  });
  return row?.role ?? null;
}

// The home time zone of the person with this email, if there is one: the zone their dates and
// times are shown in.
export async function findHomeTimeZone(db: Executor, email: string): Promise<string | null> {
  const row = await db.query.person.findFirst({
    where: eq(person.email, email),
    columns: { homeTimezone: true },
  });
  return row?.homeTimezone ?? null;
}

// Admin → Users: everyone who has signed in, with what decides their access.
export interface AppUserAdminRow {
  email: string;
  role: AppRole;
  lastSeenAt: Date | null;
  disabledAt: Date | null;
  // Their directory entry, if any, and whether it still grants access.
  personName: string | null;
  personInGoodStanding: boolean;
  // Unexpired sessions, and whether a sign-in record (auth_user) exists to reset.
  sessions: number;
  hasSignIn: boolean;
}

export async function listAppUsers(db: Executor): Promise<AppUserAdminRow[]> {
  const sessions = db
    .select({ userId: authSession.userId, n: count().as("n") })
    .from(authSession)
    .where(gt(authSession.expiresAt, sql`now()`))
    .groupBy(authSession.userId)
    .as("sessions");
  const rows = await db
    .select({
      email: appUser.email,
      role: appUser.role,
      lastSeenAt: appUser.lastSeenAt,
      disabledAt: appUser.disabledAt,
      personName: person.name,
      personInGoodStanding,
      sessions: sql<number>`COALESCE(${sessions.n}, 0)::int`,
      hasSignIn: sql<boolean>`${authUser.id} IS NOT NULL`,
    })
    .from(appUser)
    .leftJoin(person, eq(person.email, appUser.email))
    .leftJoin(authUser, eq(sql`lower(${authUser.email})`, appUser.email))
    .leftJoin(sessions, eq(sessions.userId, authUser.id))
    .orderBy(asc(appUser.email));
  return rows;
}

export type UserAccessChange =
  | { kind: "role"; role: AppRole }
  | { kind: "disable" }
  | { kind: "enable" }
  // Ends every session; the user can sign in again.
  | { kind: "end-sessions" }
  // Deletes the sign-in record (auth_user, with its provider links and sessions), so the next
  // sign-in starts fresh. For someone refused with account_not_linked after their identity
  // provider account was recreated.
  | { kind: "reset-sign-in" };

async function deleteSessions(db: Executor, email: string): Promise<number> {
  const deleted = await db
    .delete(authSession)
    .where(
      sql`${authSession.userId} IN (SELECT ${authUser.id} FROM ${authUser} WHERE lower(${authUser.email}) = ${email})`,
    )
    .returning({ id: authSession.id });
  return deleted.length;
}

// One audited change to a user's access. An admin can't change their own, so they can't lock
// themselves out, and the instance always keeps at least one admin (the actor).
export async function changeUserAccess(
  db: Database,
  actorEmail: string,
  email: string,
  change: UserAccessChange,
): Promise<void> {
  if (email === actorEmail.toLowerCase())
    throw new ValidationError("You can't change your own access. Ask another admin.");
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ role: appUser.role, disabledAt: appUser.disabledAt })
      .from(appUser)
      .where(eq(appUser.email, email))
      .for("update");
    if (!before) throw new ValidationError("That user has never signed in.");

    let after: Record<string, unknown>;
    switch (change.kind) {
      case "role":
        await tx.update(appUser).set({ role: change.role }).where(eq(appUser.email, email));
        after = { ...before, role: change.role };
        break;
      case "disable": {
        const disabledAt = before.disabledAt ?? new Date();
        await tx.update(appUser).set({ disabledAt }).where(eq(appUser.email, email));
        after = { ...before, disabledAt, sessionsEnded: await deleteSessions(tx, email) };
        break;
      }
      case "enable":
        await tx.update(appUser).set({ disabledAt: null }).where(eq(appUser.email, email));
        after = { ...before, disabledAt: null };
        break;
      case "end-sessions":
        after = { ...before, sessionsEnded: await deleteSessions(tx, email) };
        break;
      case "reset-sign-in": {
        const removed = await tx
          .delete(authUser)
          .where(eq(sql`lower(${authUser.email})`, email))
          .returning({ id: authUser.id });
        after = { ...before, signInReset: removed.length > 0 };
        break;
      }
    }
    await recordAudit(tx, actorEmail, {
      entity: "app_user",
      entityId: email,
      action: "update",
      before,
      after: { ...after, change: change.kind },
    });
  });
}
