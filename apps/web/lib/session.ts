import { redirect } from "next/navigation";
import { getDb } from "@officeorg/db/client";
import { getAppRole, type AppRole } from "@officeorg/db/queries/app-users";
import { auth } from "./auth";

export interface CurrentUser {
  email: string;
  role: AppRole;
}

// Every page and server action calls one of these. The role comes from the database on each
// call, so demoting an admin takes effect immediately rather than when their session expires.
export async function requireUser(): Promise<CurrentUser> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");

  const role = await getAppRole(getDb(), email);
  if (!role) redirect("/login");
  return { email, role };
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/forbidden");
  return user;
}
