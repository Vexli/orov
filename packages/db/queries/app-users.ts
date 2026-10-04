import { eq, sql } from "drizzle-orm";
import type { DateFormat, RegionDisplay } from "@officeorg/core";
import type { Executor } from "../client";
import { appUser, person } from "../schema";

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

export interface AppUser {
  role: AppRole;
  regionDisplay: RegionDisplay;
  dateFormat: DateFormat;
}

// The role and personal settings in one read, for the session check every page makes.
// Returns null for an email with no row, which means no access.
export async function getAppUser(db: Executor, email: string): Promise<AppUser | null> {
  const row = await db.query.appUser.findFirst({
    where: eq(appUser.email, email),
    columns: { role: true, regionDisplay: true, dateFormat: true },
  });
  return row ?? null;
}

export type UserSettings = Pick<AppUser, "regionDisplay" | "dateFormat">;

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
