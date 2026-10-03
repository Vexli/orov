"use server";

import { revalidatePath } from "next/cache";
import { teamFormSchema } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { ValidationError } from "@officeorg/db/queries/errors";
import { deleteTeam, saveTeam } from "@officeorg/db/queries/teams";
import { requireAdmin } from "@/lib/session";

export type TeamSaveState = { ok: true; id: string } | { ok: false; error: string; field?: string };

export async function saveTeamAction(input: unknown, id?: string): Promise<TeamSaveState> {
  const user = await requireAdmin();
  const parsed = teamFormSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the form", field: String(issue?.path[0] ?? "") };
  }
  try {
    const saved = await saveTeam(getDb(), user.email, parsed.data, id);
    revalidatePath("/admin/teams");
    return { ok: true, id: saved.id };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message, field: error.field };
    throw error;
  }
}

export async function deleteTeamAction(id: string): Promise<TeamSaveState> {
  const user = await requireAdmin();
  try {
    await deleteTeam(getDb(), user.email, id);
    revalidatePath("/admin/teams");
    return { ok: true, id };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
