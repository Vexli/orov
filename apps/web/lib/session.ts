import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@officeorg/db/client";
import { canonicalTimeZone, type DateFormat, type RegionDisplay, type RegionFormat } from "@officeorg/core";
import { findHomeTimeZone, getAppUser, type AppRole, type AppUser } from "@officeorg/db/queries/app-users";
import { auth } from "./auth";
import { TIME_ZONE_COOKIE } from "./time-zone-cookie";

export interface CurrentUser {
  email: string;
  role: AppRole;
  // The user's own settings for how region codes are shown (plan.md §7), and whether with a
  // flag (#28).
  regionDisplay: RegionDisplay;
  regionFlag: boolean;
  // The user's own setting for how dates and times are shown (#27).
  dateFormat: DateFormat;
  // The zone their times are shown in: their home time zone if they're in the directory, else
  // their browser's (TimeZoneCookie), else UTC.
  timeZone: string;
}

// The user's region settings, in the shape the directory and map loaders take.
export function regionFormatOf(user: CurrentUser): RegionFormat {
  return { display: user.regionDisplay, flag: user.regionFlag };
}

async function currentUser(email: string, user: AppUser): Promise<CurrentUser> {
  const home = await findHomeTimeZone(getDb(), email);
  const browser = canonicalTimeZone((await cookies()).get(TIME_ZONE_COOKIE)?.value ?? "");
  return { email, ...user, timeZone: home ?? browser ?? "UTC" };
}

// Every page and server action calls one of these. The role and settings come from the database
// on each call, so demoting an admin takes effect immediately rather than when their session
// expires, and a changed setting applies on the next page load.
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const user = await getAppUser(getDb(), email);
  if (!user) redirect("/login");
  return currentUser(email, user);
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/forbidden");
  return user;
}

// For route handlers, which should answer 403 rather than redirect to a page.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const user = await getAppUser(getDb(), email);
  return user ? currentUser(email, user) : null;
}
