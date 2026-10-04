import Link from "next/link";
import { getDb } from "@officeorg/db/client";
import { listTeamsForAdmin } from "@officeorg/db/queries/teams";
import { TeamsTable, type TeamsTableRow } from "@/components/admin/teams-table";

// Orders teams depth-first, so each sub-team sits under its parent.
function flatten(teams: Awaited<ReturnType<typeof listTeamsForAdmin>>): TeamsTableRow[] {
  const children = new Map<string | null, typeof teams>();
  for (const t of teams) {
    const key = t.parentTeamId;
    children.set(key, [...(children.get(key) ?? []), t]);
  }
  const out: TeamsTableRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const t of children.get(parentId) ?? []) {
      out.push({ ...t, depth });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export default async function TeamsAdminPage() {
  const rows = flatten(await listTeamsForAdmin(getDb()));

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-heading">Teams</h1>
          <p className="mt-1 text-sm text-muted-fg">
            A team can only move under a team that isn&apos;t one of its own sub-teams.
          </p>
        </div>
        <Link href="/admin/teams/new" className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-fg">
          New team
        </Link>
      </div>

      <TeamsTable rows={rows} />
    </div>
  );
}
