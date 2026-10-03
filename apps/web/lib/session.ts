import { redirect } from "next/navigation";
import { getDb } from "@officeorg/db/client";
import type { RegionDisplay } from "@officeorg/core";
import { getAppUser, type AppRole } from "@officeorg/db/queries/app-users";
import { auth } from "./auth";

export interface CurrentUser {
  email: string;
  role: AppRole;
  // The user's own setting for how region codes are shown (plan.md §7).
  regionDisplay: RegionDisplay;
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
  return { email, ...user };
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
  return user ? { email, ...user } : null;
}
