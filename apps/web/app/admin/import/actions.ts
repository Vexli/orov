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
  type PlanResult,
} from "@officeorg/db/queries/import";
import type { ImportPlan, PersonRecord, TeamRecord } from "@officeorg/core";

// `skip` is the file lines to leave out. A preview can ask to skip every row with an error (and
// the rows that depend on them); it returns the full skip list, which Apply then sends back.
export interface ImportInput {
  text: string;
  skip?: number[];
  skipErrors?: boolean;
}

export type PreviewState =
  | { ok: true; plan: ImportPlan<PersonRecord> | ImportPlan<TeamRecord>; skip: number[] }
  | { ok: false; error: string };

export type ApplyState = { ok: true; result: ApplyResult } | { ok: false; error: string };

// The input comes from the browser, so the skip list is checked to be line numbers.
function lines(skip: unknown): number[] {
  return Array.isArray(skip) ? skip.filter((n): n is number => Number.isInteger(n) && n > 0) : [];
}

function toPreview(result: PlanResult<PersonRecord> | PlanResult<TeamRecord>): PreviewState {
  return result.ok ? { ok: true, plan: result.plan, skip: result.skip } : { ok: false, error: result.fatal };
}

async function applying(run: () => Promise<ApplyResult>): Promise<ApplyState> {
  try {
    return { ok: true, result: await run() };
  } catch (error) {
    if (error instanceof ImportRejectedError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function previewPeopleImport(input: ImportInput): Promise<PreviewState> {
  await requireAdmin();
  const options = { skip: lines(input.skip), skipErrors: input.skipErrors === true };
  return toPreview(await planPeopleCsv(getDb(), String(input.text), options));
}

export async function applyPeopleImport(input: ImportInput): Promise<ApplyState> {
  const user = await requireAdmin();
  return applying(() => applyPeopleCsv(getDb(), user.email, String(input.text), lines(input.skip)));
}

export async function previewTeamsImport(input: ImportInput): Promise<PreviewState> {
  await requireAdmin();
  const options = { skip: lines(input.skip), skipErrors: input.skipErrors === true };
  return toPreview(await planTeamsCsv(getDb(), String(input.text), options));
}

export async function applyTeamsImport(input: ImportInput): Promise<ApplyState> {
  const user = await requireAdmin();
  return applying(() => applyTeamsCsv(getDb(), user.email, String(input.text), lines(input.skip)));
}
