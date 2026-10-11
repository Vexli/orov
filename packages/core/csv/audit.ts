import { stringify } from "csv-stringify/sync";
import { SAFE_CSV_CAST } from "./formula";

// How the audit log page and its CSV export describe a change. Kept together so the two agree.

export interface AuditRow {
  at: Date;
  actorEmail: string;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
}

export const AUDIT_CSV_HEADERS = [
  "at",
  "actor_email",
  "entity",
  "entity_id",
  "action",
  "changed_fields",
  "before",
  "after",
] as const;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

// Top-level fields whose value differs between before and after, in first-seen order.
export function changedFields(before: unknown, after: unknown): string[] {
  const b = asRecord(before);
  const a = asRecord(after);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null),
  );
}

// One line per changed field, "field: before → after", so a wide row stays readable.
export function summarizeAuditChange(before: unknown, after: unknown): string {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = changedFields(before, after);
  if (keys.length === 0) return "(no field changes)";
  return keys
    .map((k) => `${k}: ${JSON.stringify(b[k] ?? null)} → ${JSON.stringify(a[k] ?? null)}`)
    .join("\n");
}

// Times are ISO 8601 in UTC. before and after are the full JSON, so nothing is lost to the summary.
export function auditToCsv(rows: AuditRow[]): string {
  const data = rows.map((r) => [
    r.at.toISOString(),
    r.actorEmail,
    r.entity,
    r.entityId,
    r.action,
    changedFields(r.before, r.after).join(";"),
    r.before == null ? "" : JSON.stringify(r.before),
    r.after == null ? "" : JSON.stringify(r.after),
  ]);
  return stringify(data, { header: true, columns: [...AUDIT_CSV_HEADERS], cast: SAFE_CSV_CAST });
}
