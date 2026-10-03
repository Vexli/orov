"use server";

import { revalidatePath } from "next/cache";
import { floorFormSchema, locationFormSchema } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { ValidationError } from "@officeorg/db/queries/errors";
import { saveFloor, saveLocation } from "@officeorg/db/queries/floors";
import { requireAdmin } from "@/lib/session";

export type SpaceSaveState =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: string };

function firstIssue(error: { issues: { message: string; path: PropertyKey[] }[] }): SpaceSaveState {
  const issue = error.issues[0];
  return {
    ok: false,
    error: issue?.message ?? "Check the form",
    field: String(issue?.path[0] ?? ""),
  };
}

export async function saveLocationAction(input: unknown, id?: string): Promise<SpaceSaveState> {
  const user = await requireAdmin();
  const parsed = locationFormSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const saved = await saveLocation(getDb(), user.email, parsed.data, id);
    revalidatePath("/admin/locations");
    return { ok: true, id: saved.id };
  } catch (error) {
    if (error instanceof ValidationError)
      return { ok: false, error: error.message, field: error.field };
    throw error;
  }
}

export async function saveFloorAction(
  locationId: string,
  input: unknown,
  id?: string,
): Promise<SpaceSaveState> {
  const user = await requireAdmin();
  const parsed = floorFormSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  try {
    const saved = await saveFloor(getDb(), user.email, locationId, parsed.data, id);
    revalidatePath("/admin/locations");
    return { ok: true, id: saved.id };
  } catch (error) {
    if (error instanceof ValidationError)
      return { ok: false, error: error.message, field: error.field };
    throw error;
  }
}
