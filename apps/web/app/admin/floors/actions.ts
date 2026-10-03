"use server";

import { revalidatePath } from "next/cache";
import type { FloorDiff } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { ValidationError } from "@officeorg/db/queries/errors";
import {
  applyFloorUpload,
  previewFloorRollback,
  previewFloorUpload,
  rollbackFloor,
} from "@officeorg/db/queries/floors";
import { requireAdmin } from "@/lib/session";

// The drawing travels as text both times: once to preview, once to apply. Apply re-runs the
// whole pipeline inside its transaction, so the preview can't go stale between the two.

export type PreviewState =
  | { ok: true; diff: FloorDiff; identical: boolean; sanitizedSvg: string }
  | { ok: false; error: string };

export type ApplyState = { ok: true; version: number } | { ok: false; error: string };

// Server actions are public endpoints, so the arguments are checked rather than trusted.
function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Bad request");
  return value;
}

async function attempt<T>(run: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function previewUploadAction(floorId: string, svg: string): Promise<PreviewState> {
  await requireAdmin();
  const input = { floorId: text(floorId), svg: text(svg) };
  return attempt(async () => ({
    ok: true as const,
    ...(await previewFloorUpload(getDb(), input.floorId, input.svg)),
  }));
}

export async function applyUploadAction(
  floorId: string,
  svg: string,
  confirmDeskless: boolean,
): Promise<ApplyState> {
  const user = await requireAdmin();
  const input = { floorId: text(floorId), svg: text(svg) };
  return attempt(async () => {
    const result = await applyFloorUpload(getDb(), user.email, input.floorId, input.svg, {
      confirmDeskless: confirmDeskless === true,
    });
    revalidatePath(`/admin/floors/${input.floorId}`);
    return { ok: true as const, version: result.version };
  });
}

export async function previewRollbackAction(
  floorId: string,
  assetId: string,
): Promise<PreviewState> {
  await requireAdmin();
  const input = { floorId: text(floorId), assetId: text(assetId) };
  return attempt(async () => ({
    ok: true as const,
    ...(await previewFloorRollback(getDb(), input.floorId, input.assetId)),
  }));
}

export async function rollbackAction(
  floorId: string,
  assetId: string,
  confirmDeskless: boolean,
): Promise<ApplyState> {
  const user = await requireAdmin();
  const input = { floorId: text(floorId), assetId: text(assetId) };
  return attempt(async () => {
    const result = await rollbackFloor(getDb(), user.email, input.floorId, input.assetId, {
      confirmDeskless: confirmDeskless === true,
    });
    revalidatePath(`/admin/floors/${input.floorId}`);
    return { ok: true as const, version: result.version };
  });
}
