"use server";

import { requireAdmin } from "@/lib/session";
import { getDb } from "@officeorg/db/client";
import {
  applyPeopleCsv,
  applyTeamsCsv,
  ImportRejectedError,
  planPeopleCsv,
  planTeamsCsv,
  type ApplyResult,
} from "@officeorg/db/queries/import";
import type { ImportPlan, PersonRecord, TeamRecord } from "@officeorg/core";

export type PreviewState =
  | { ok: true; plan: ImportPlan<PersonRecord> | ImportPlan<TeamRecord> }
  | { ok: false; error: string };

export type ApplyState = { ok: true; result: ApplyResult } | { ok: false; error: string };

export async function previewPeopleImport(text: string): Promise<PreviewState> {
  await requireAdmin();
  const result = await planPeopleCsv(getDb(), text);
  return result.ok ? { ok: true, plan: result.plan } : { ok: false, error: result.fatal };
}

export async function applyPeopleImport(text: string): Promise<ApplyState> {
  const user = await requireAdmin();
  try {
    return { ok: true, result: await applyPeopleCsv(getDb(), user.email, text) };
  } catch (error) {
    if (error instanceof ImportRejectedError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function previewTeamsImport(text: string): Promise<PreviewState> {
  await requireAdmin();
  const result = await planTeamsCsv(getDb(), text);
  return result.ok ? { ok: true, plan: result.plan } : { ok: false, error: result.fatal };
}

export async function applyTeamsImport(text: string): Promise<ApplyState> {
  const user = await requireAdmin();
  try {
    return { ok: true, result: await applyTeamsCsv(getDb(), user.email, text) };
  } catch (error) {
    if (error instanceof ImportRejectedError) return { ok: false, error: error.message };
    throw error;
  }
}
