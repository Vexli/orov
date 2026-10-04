import { auditToCsv } from "@officeorg/core";
import { getDb } from "@officeorg/db/client";
import { listAudit, recordAudit } from "@officeorg/db/queries/audit";
import { parseAuditFilters } from "@/lib/audit-filters";
import { getCurrentUser } from "@/lib/session";

// The audit log as CSV, with the same filters as /admin/audit. The download is itself recorded,
// so the log shows who took a copy and of what.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return new Response("Forbidden", { status: 403 });

  const filters = parseAuditFilters(Object.fromEntries(new URL(request.url).searchParams));
  const db = getDb();
  const rows = await listAudit(db, { ...filters, limit: null });
  await recordAudit(db, user.email, {
    entity: "audit_log",
    entityId: "export",
    action: "export",
    after: { filters, rows: rows.length },
  });

  return new Response(auditToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
      "Cache-Control": "no-store",
    },
  });
}
