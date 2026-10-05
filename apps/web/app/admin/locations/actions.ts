"use server";

import { revalidatePath } from "next/cache";
import { floorFormSchema, locationFormSchema } from "@orov/core";
import { getDb } from "@orov/db/client";
import { ValidationError } from "@orov/db/queries/errors";
import {
  deleteFloor,
  deleteLocation,
  DesklessConfirmationNeeded,
  saveFloor,
  saveLocation,
  setFloorArchived,
  setLocationArchived,
} from "@orov/db/queries/floors";
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

// Archiving, unarchiving and deleting offices and floors (#22).
export type ArchiveState =
  | { ok: true }
  | { ok: false; error: string; // People who would lose their desk, when the admin hasn't confirmed yet.
      deskless?: string[] };

type Target = { kind: "floor" | "office"; id: string };

async function run(work: () => Promise<void>): Promise<ArchiveState> {
  try {
    await work();
  } catch (error) {
    if (error instanceof DesklessConfirmationNeeded) return { ok: false, error: error.message, deskless: error.people };
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
  // Floors and offices appear in the map, directory filters, search and admin pages.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setArchivedAction(target: Target, archived: boolean, confirmDeskless: boolean): Promise<ArchiveState> {
  const user = await requireAdmin();
  const options = { confirmDeskless: confirmDeskless === true };
  return run(() =>
    target.kind === "floor"
      ? setFloorArchived(getDb(), user.email, String(target.id), archived === true, options)
      : setLocationArchived(getDb(), user.email, String(target.id), archived === true, options),
  );
}

export async function deleteAction(target: Target): Promise<ArchiveState> {
  const user = await requireAdmin();
  return run(() =>
    target.kind === "floor"
      ? deleteFloor(getDb(), user.email, String(target.id))
      : deleteLocation(getDb(), user.email, String(target.id)),
  );
}
