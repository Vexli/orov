"use server";

import { revalidatePath } from "next/cache";
import { bulkUpdateInputSchema, personFormSchema } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { ValidationError } from "@officeorg/db/queries/errors";
import { bulkUpdatePeople, savePerson } from "@officeorg/db/queries/people";
import { requireAdmin } from "@/lib/session";

export type SaveState = { ok: true; id: string } | { ok: false; error: string; field?: string };

// Input arrives from the browser, so it is validated again here with the same schema the form uses.
export async function savePersonAction(input: unknown, id?: string): Promise<SaveState> {
  const user = await requireAdmin();
  const parsed = personFormSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Nested fields are named by their path, e.g. "identities.github".
    return { ok: false, error: issue?.message ?? "Check the form", field: issue?.path.join(".") ?? "" };
  }
  try {
    const saved = await savePerson(getDb(), user.email, parsed.data, id);
    revalidatePath("/admin/people");
    return { ok: true, id: saved.id };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message, field: error.field };
    throw error;
  }
}

export type BulkState = { ok: true; updated: number } | { ok: false; error: string };

// One change for several people (#7). All of them are saved, or none.
export async function bulkUpdatePeopleAction(ids: unknown, patch: unknown): Promise<BulkState> {
  const user = await requireAdmin();
  const parsed = bulkUpdateInputSchema.safeParse({ ids, patch });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Choose people and a change" };
  try {
    const result = await bulkUpdatePeople(getDb(), user.email, parsed.data.ids, parsed.data.patch);
    revalidatePath("/admin/people");
    return { ok: true, updated: result.updated };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
