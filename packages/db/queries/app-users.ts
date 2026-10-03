import { eq, sql } from "drizzle-orm";
import type { Executor } from "../client";
import { appUser } from "../schema";

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

// Authoritative role lookup. Returns null for an email with no row, which means no access.
export async function getAppRole(db: Executor, email: string): Promise<AppRole | null> {
  const row = await db.query.appUser.findFirst({
    where: eq(appUser.email, email),
    columns: { role: true },
  });
  return row?.role ?? null;
}
