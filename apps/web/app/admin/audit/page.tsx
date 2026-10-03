import { getDb } from "@officeorg/db/client";
import { listAudit } from "@officeorg/db/queries/audit";

const ENTITIES = ["all", "person", "team", "location", "floor", "theme", "brand_asset"] as const;
type Entity = Exclude<(typeof ENTITIES)[number], "all">;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string }>;
}) {
  const { entity } = await searchParams;
  const filter = ENTITIES.includes(entity as Entity) && entity !== "all" ? (entity as Entity) : undefined;
  const rows = await listAudit(getDb(), { entity: filter, limit: 300 });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-heading">Audit log</h1>
        <nav className="flex gap-3 text-sm" aria-label="Filter by entity">
          {ENTITIES.map((e) => {
            const active = (e === "all" && !filter) || e === filter;
            return (
              <a
                key={e}
                href={e === "all" ? "/admin/audit" : `/admin/audit?entity=${e}`}
                className={active ? "font-semibold underline" : "text-muted-fg"}
              >
                {e}
              </a>
            );
          })}
        </nav>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
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
              <tr key={String(row.id)} className="border-b border-border align-top">
                <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted-fg">
                  {row.at.toISOString().replace("T", " ").slice(0, 16)}
                </td>
                <td className="py-2 pr-3">{row.actorEmail}</td>
                <td className="py-2 pr-3">
                  {row.entity} <span className="font-mono text-xs text-muted-fg">{row.entityId}</span>
                </td>
                <td className="py-2 pr-3">{row.action}</td>
                <td className="py-2">
                  <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap text-xs text-muted-fg">
                    {summarize(row.before, row.after)}
                  </pre>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-fg">
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
