import { desc, eq } from "drizzle-orm";
import type { Executor } from "../client";
import { auditLog } from "../schema";

export interface AuditEntry {
  entity: "person" | "team" | "location" | "floor";
  entityId: string;
  action: "create" | "update" | "delete";
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

export async function listAudit(
  db: Executor,
  options: { entity?: AuditEntry["entity"]; limit?: number } = {},
) {
  const query = db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(options.limit ?? 200);
  return options.entity ? query.where(eq(auditLog.entity, options.entity)) : query;
}
