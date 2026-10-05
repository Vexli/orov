import type { FieldChange } from "../records";

// Shared shape for the dry-run diff. People and teams both produce one of these per row.
// "skipped" rows are ones the admin chose to leave out: nothing is written for them.
export type RowAction = "create" | "update" | "unchanged" | "error" | "skipped";

export interface PlannedRow<R> {
  line: number;
  key: string;
  action: RowAction;
  changes: FieldChange[];
  // Why a row is an error, or, for a skipped row, the error it had when it was skipped.
  message?: string;
  record?: R;
}

export interface ImportPlan<R> {
  rows: PlannedRow<R>[];
  // Apply needs no error among the rows that aren't skipped, and at least one row to apply.
  canApply: boolean;
  counts: Record<RowAction, number>;
}

// Rows come back in file order, so the dry-run reads like the spreadsheet.
export function summarize<R>(unsorted: PlannedRow<R>[]): ImportPlan<R> {
  const rows = [...unsorted].sort((a, b) => a.line - b.line);
  const counts: Record<RowAction, number> = { create: 0, update: 0, unchanged: 0, error: 0, skipped: 0 };
  for (const row of rows) counts[row.action] += 1;
  const toApply = counts.create + counts.update + counts.unchanged;
  return { rows, canApply: counts.error === 0 && toApply > 0, counts };
}

// Skips every row with an error, then re-plans, because leaving a row out can break the rows that
// depend on it (a manager defined on it, the other half of a desk swap, a parent team). Repeats
// until no new errors appear. Each skipped row keeps the error that got it skipped, so the dry run
// can show the cascade ("its manager is on line 7, which is skipped").
export function planSkippingErrors<R>(
  plan: (skip: ReadonlySet<number>) => ImportPlan<R>,
  initial: ReadonlySet<number> = new Set(),
): { plan: ImportPlan<R>; skip: Set<number> } {
  const skip = new Set(initial);
  const reasons = new Map<number, string | undefined>();
  // Each round skips at least one more line, so this ends within the file's length.
  for (;;) {
    const result = plan(skip);
    const errors = result.rows.filter((r) => r.action === "error");
    if (errors.length === 0) {
      const rows = result.rows.map((r) =>
        r.action === "skipped" && reasons.has(r.line) ? { ...r, message: reasons.get(r.line) } : r,
      );
      return { plan: { ...result, rows }, skip };
    }
    for (const row of errors) {
      skip.add(row.line);
      reasons.set(row.line, row.message);
    }
  }
}
