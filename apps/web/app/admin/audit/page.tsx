import { getDb } from "@officeorg/db/client";
import { listAudit } from "@officeorg/db/queries/audit";

const ENTITIES = ["all", "person", "team"] as const;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const filter = entity === "person" || entity === "team" ? entity : undefined;
  const rows = await listAudit(getDb(), { entity: filter, limit: 300 });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Audit log</h1>
        <nav className="flex gap-3 text-sm" aria-label="Filter by entity">
          {ENTITIES.map((e) => {
            const active = (e === "all" && !filter) || e === filter;
            return (
              <a
                key={e}
                href={e === "all" ? "/admin/audit" : `/admin/audit?entity=${e}`}
                className={active ? "font-semibold underline" : "text-neutral-600 dark:text-neutral-400"}
              >
                {e}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="py-2 pr-3 font-medium">Who</th>
              <th className="py-2 pr-3 font-medium">Entity</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)} className="border-b border-neutral-100 align-top dark:border-neutral-900">
                <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-neutral-500">
                  {row.at.toISOString().replace("T", " ").slice(0, 16)}
                </td>
                <td className="py-2 pr-3">{row.actorEmail}</td>
                <td className="py-2 pr-3">
                  {row.entity} <span className="font-mono text-xs text-neutral-500">{row.entityId}</span>
                </td>
                <td className="py-2 pr-3">{row.action}</td>
                <td className="py-2">
                  <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-400">
                    {summarize(row.before, row.after)}
                  </pre>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-500">
                  No changes recorded yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Shows only the fields that changed, so the table stays readable for wide rows.
function summarize(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null),
  );
  if (keys.length === 0) return "(no field changes)";
  return keys.map((k) => `${k}: ${JSON.stringify(b[k] ?? null)} → ${JSON.stringify(a[k] ?? null)}`).join("\n");
}
