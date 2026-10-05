"use server";

import { revalidatePath } from "next/cache";
import { selfProfileSchema, type SelfProfileForm } from "@orov/core";
import { getDb } from "@orov/db/client";
import { ValidationError } from "@orov/db/queries/errors";
import { saveOwnProfile } from "@orov/db/queries/people";
import { requireUser } from "@/lib/session";

export type ProfileState = { ok: true; saved: SelfProfileForm } | { ok: false; error: string; field?: string };

// Anyone signed in can change their own profile (#20), and only their own: the person is found by
// the session's email, and the schema keeps only the self-editable fields, so a crafted request
// can't change a title, manager or anyone else.
export async function saveProfileAction(input: unknown): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = selfProfileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Check the form", field: issue?.path.join(".") ?? "" };
  }
  let saved: SelfProfileForm;
  try {
    saved = await saveOwnProfile(getDb(), user.email, parsed.data);
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message, field: error.field };
    throw error;
  }
  // The directory, map and org chart show these fields.
  revalidatePath("/", "layout");
  return { ok: true, saved };
}
