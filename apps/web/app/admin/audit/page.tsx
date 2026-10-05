import { formatDateTime, summarizeAuditChange } from "@orov/core";
import { getDb } from "@orov/db/client";
import { AUDIT_ENTITIES, listAudit } from "@orov/db/queries/audit";
import { auditQuery, parseAuditFilters } from "@/lib/audit-filters";
import { requireAdmin } from "@/lib/session";

const PAGE_SIZE = 100;

const inputClass = "mt-1 block rounded-md border border-border bg-transparent px-3 py-2 text-sm";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const before =
    typeof params.before === "string" && /^\d+$/.test(params.before) ? params.before : null;
  // Dates in the filter, and the times shown, are in the viewer's time zone.
  const rows = await listAudit(getDb(), {
    ...filters,
    timeZone: user.timeZone,
    beforeId: before ? BigInt(before) : undefined,
    limit: PAGE_SIZE,
  });
  // A full page may have more behind it. Keyset paging on the id keeps pages stable while new
  // entries arrive.
  const olderId = rows.length === PAGE_SIZE ? String(rows[rows.length - 1]!.id) : null;
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-heading">Audit log</h1>
        <a
          href={`/api/export/audit${auditQuery(filters)}`}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium"
        >
          Export CSV
        </a>
      </div>

      {/* A plain GET form: the filters live in the URL, so a filtered view can be shared. */}
      <form
        method="get"
        className="mt-4 flex flex-wrap items-end gap-3"
        aria-label="Filter the audit log"
      >
        <label className="text-sm font-medium">
          Entity
          <select name="entity" defaultValue={filters.entity ?? ""} className={inputClass}>
            <option value="">All</option>
            {AUDIT_ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          From
          <input type="date" name="from" defaultValue={filters.from ?? ""} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          To
          <input type="date" name="to" defaultValue={filters.to ?? ""} className={inputClass} />
        </label>
        <label className="text-sm font-medium">
          Who
          <input
            type="search"
            name="actor"
            placeholder="Email"
            defaultValue={filters.actor ?? ""}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg"
        >
          Filter
        </button>
        {filtered ? (
          <a href="/admin/audit" className="py-2 text-sm underline underline-offset-4">
            Clear
          </a>
        ) : null}
      </form>

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
                  {formatDateTime(row.at, user.dateFormat, user.timeZone, { zone: true })}
                </td>
                <td className="py-2 pr-3">{row.actorEmail}</td>
                <td className="py-2 pr-3">
                  {row.entity}{" "}
                  <span className="font-mono text-xs text-muted-fg">{row.entityId}</span>
                </td>
                <td className="py-2 pr-3">{row.action}</td>
                <td className="py-2">
                  <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap text-xs text-muted-fg">
                    {summarizeAuditChange(row.before, row.after)}
                  </pre>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-fg">
                  {filtered || before ? "No entries match." : "No changes recorded yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <nav aria-label="Audit log pages" className="mt-4 flex gap-4 text-sm">
        {before ? (
          <a href={`/admin/audit${auditQuery(filters)}`} className="underline underline-offset-4">
            ← Newest
          </a>
        ) : null}
        {olderId ? (
          <a
            href={`/admin/audit${auditQuery(filters, { before: olderId })}`}
            className="underline underline-offset-4"
          >
            Older →
          </a>
        ) : null}
      </nav>
    </div>
  );
}
