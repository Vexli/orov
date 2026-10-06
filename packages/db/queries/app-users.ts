import { eq, sql } from "drizzle-orm";
import {
  DEFAULT_UI_LOCALE,
  isBootstrapAdmin,
  isUiLocale,
  type DateFormat,
  type RegionDisplay,
  type UiLocale,
} from "@orov/core";
import type { Executor } from "../client";
import { appUser, authUser, person } from "../schema";

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

// The last check before Better Auth creates a session, whatever the sign-in method: the account's
// email must be on the company domain. Passing it records the sign-in, so the app_user row exists
// from the first request on. False refuses the session.
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
// Returns null for an email with no row, which means no access.
export async function getAppUser(db: Executor, email: string): Promise<AppUser | null> {
  const row = await db.query.appUser.findFirst({
    where: eq(appUser.email, email),
    columns: { role: true, regionDisplay: true, regionFlag: true, dateFormat: true, locale: true },
  });
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
