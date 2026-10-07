"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@orov/db/client";
import { changeUserAccess, type UserAccessChange } from "@orov/db/queries/app-users";
import { ValidationError } from "@orov/db/queries/errors";
import { requireAdmin } from "@/lib/session";

export type UserAccessState = { ok: true } | { ok: false; error: string };

// Server actions are public endpoints, so the change is checked rather than trusted.
function parseChange(value: unknown): UserAccessChange | null {
  if (typeof value !== "object" || value === null) return null;
  const { kind, role } = value as { kind?: unknown; role?: unknown };
  if (kind === "role") return role === "admin" || role === "viewer" ? { kind, role } : null;
  if (
    kind === "disable" ||
    kind === "enable" ||
    kind === "end-sessions" ||
    kind === "reset-sign-in"
  )
    return { kind };
  return null;
}

export async function changeUserAccessAction(
  email: unknown,
  change: unknown,
): Promise<UserAccessState> {
  const user = await requireAdmin();
  const parsed = parseChange(change);
  if (typeof email !== "string" || email === "" || !parsed)
    return { ok: false, error: "Bad request" };
  try {
    await changeUserAccess(getDb(), user.email, email.trim().toLowerCase(), parsed);
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath("/admin/users");
  return { ok: true };
}
