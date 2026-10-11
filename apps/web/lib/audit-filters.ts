import { AUDIT_ENTITIES, type AuditFilters } from "@orov/db/queries/audit";

type Params = Record<string, string | string[] | undefined>;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// The audit page and its CSV export read the same query string, so an export holds exactly what
// the page shows. Anything malformed is ignored rather than rejected.
export function parseAuditFilters(params: Params): AuditFilters {
  const entity = one(params.entity);
  const from = one(params.from);
  const to = one(params.to);
  const actor = one(params.actor)?.trim();
  return {
    entity: AUDIT_ENTITIES.find((e) => e === entity),
    from: from && isoDate.test(from) ? from : undefined,
    to: to && isoDate.test(to) ? to : undefined,
    actor: actor || undefined,
  };
}

// The filters as a query string, without empty values, for links that keep them.
export function auditQuery(filters: AuditFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...extra })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
