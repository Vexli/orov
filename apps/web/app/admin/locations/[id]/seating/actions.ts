"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@officeorg/db/client";
import { ValidationError } from "@officeorg/db/queries/errors";
import { applySeating, previewSeating, type SeatingMove } from "@officeorg/db/queries/seating";
import { requireAdmin } from "@/lib/session";

export type SeatingPreview =
  | { ok: true; moves: SeatingMove[]; unseated: string[] }
  | { ok: false; error: string };

const ids = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

export async function previewSeatingAction(locationId: string, locked: unknown): Promise<SeatingPreview> {
  await requireAdmin();
  const plan = await previewSeating(getDb(), String(locationId), ids(locked));
  return { ok: true, moves: plan.moves, unseated: plan.unseated };
}

export async function applySeatingAction(
  locationId: string,
  moves: unknown,
): Promise<{ ok: true; moved: number } | { ok: false; error: string }> {
  const user = await requireAdmin();
  const list = Array.isArray(moves)
    ? moves.flatMap((m) =>
        m && typeof m.personId === "string" && typeof m.deskId === "string" ? [{ personId: m.personId, deskId: m.deskId }] : [],
      )
    : [];
  try {
    const result = await applySeating(getDb(), user.email, String(locationId), list);
    revalidatePath("/", "layout");
    return { ok: true, moved: result.moved };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
