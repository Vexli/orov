import { and, desc, eq, gte, ilike, lt, type SQL } from "drizzle-orm";
import { containsPattern, startOfDay } from "@officeorg/core";
import type { Executor } from "../client";
import { auditLog } from "../schema";

export const AUDIT_ENTITIES = [
  "person",
  "team",
  "location",
  "floor",
  "theme",
  "brand_asset",
  // Rooms, points of interest and areas renamed in the app (#21).
  "space",
  "area",
  // A download of the audit log itself, so the log shows who took a copy.
  "audit_log",
] as const;

export interface AuditEntry {
  entity: (typeof AUDIT_ENTITIES)[number];
  entityId: string;
  action: "create" | "update" | "delete" | "export";
  before?: unknown;
  after?: unknown;
}

// Every admin write calls this inside its own transaction, so an audit row exists if and only if
// the change it describes was committed.
export async function recordAudit(db: Executor, actorEmail: string, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorEmail,
    entity: entry.entity,
    entityId: entry.entityId,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

export interface AuditFilters {
  entity?: AuditEntry["entity"];
  // Inclusive calendar dates, YYYY-MM-DD, in `timeZone` (UTC unless given).
  from?: string;
  to?: string;
  timeZone?: string;
  // Part of the actor's email, ignoring case.
  actor?: string;
}

// Newest first. `beforeId` pages backwards: pass the last id of the previous page. `limit: null`
// returns every match, for the export.
export async function listAudit(
  db: Executor,
  options: AuditFilters & { beforeId?: bigint; limit?: number | null } = {},
) {
  const where: SQL[] = [];
  if (options.entity) where.push(eq(auditLog.entity, options.entity));
  if (options.from) where.push(gte(auditLog.at, startOfDay(options.from, options.timeZone)));
  if (options.to) where.push(lt(auditLog.at, startOfDay(options.to, options.timeZone, 1)));
  if (options.actor) where.push(ilike(auditLog.actorEmail, containsPattern(options.actor)));
  if (options.beforeId !== undefined) where.push(lt(auditLog.id, options.beforeId));
  const query = db
    .select()
    .from(auditLog)
    .where(and(...where))
    .orderBy(desc(auditLog.id));
  const limit = options.limit === undefined ? 200 : options.limit;
  return limit === null ? query : query.limit(limit);
}
