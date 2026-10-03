import type { FieldChange } from "../records";

// Shared shape for the dry-run diff. People and teams both produce one of these per row.
export type RowAction = "create" | "update" | "unchanged" | "error";

export interface PlannedRow<R> {
  line: number;
  key: string;
  action: RowAction;
  changes: FieldChange[];
  message?: string;
  record?: R;
}

export interface ImportPlan<R> {
  rows: PlannedRow<R>[];
  // Apply is all-or-nothing: a single error row blocks the whole import.
  canApply: boolean;
  counts: Record<RowAction, number>;
}

// Rows come back in file order, so the dry-run reads like the spreadsheet.
export function summarize<R>(unsorted: PlannedRow<R>[]): ImportPlan<R> {
  const rows = [...unsorted].sort((a, b) => a.line - b.line);
  const counts: Record<RowAction, number> = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const row of rows) counts[row.action] += 1;
  return { rows, canApply: counts.error === 0 && rows.length > 0, counts };
}
