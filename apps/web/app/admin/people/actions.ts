"use server";

import { revalidatePath } from "next/cache";
import { personFormSchema } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { ValidationError } from "@officeorg/db/queries/errors";
import { savePerson } from "@officeorg/db/queries/people";
import { requireAdmin } from "@/lib/session";

export type SaveState = { ok: true; id: string } | { ok: false; error: string; field?: string };

// Input arrives from the browser, so it is validated again here with the same schema the form uses.
export async function savePersonAction(input: unknown, id?: string): Promise<SaveState> {
  const user = await requireAdmin();
  const parsed = personFormSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the form", field: String(issue?.path[0] ?? "") };
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
