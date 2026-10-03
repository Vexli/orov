import Link from "next/link";
import { getDb } from "@officeorg/db/client";
import { listTeamsForAdmin } from "@officeorg/db/queries/teams";

interface Row {
  id: string;
  slug: string;
  name: string;
  leadName: string | null;
  memberCount: number;
  depth: number;
  parentName: string | null;
  childCount: number;
}

// Orders teams depth-first, so each sub-team sits under its parent.
function flatten(teams: Awaited<ReturnType<typeof listTeamsForAdmin>>): Row[] {
  const children = new Map<string | null, typeof teams>();
  for (const t of teams) {
    const key = t.parentTeamId;
    children.set(key, [...(children.get(key) ?? []), t]);
  }
  const out: Row[] = [];
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
          <h1 className="text-xl font-semibold">Teams</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            A team can only move under a team that isn&apos;t one of its own sub-teams.
          </p>
        </div>
        <Link href="/admin/teams/new" className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
          New team
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="py-2 pr-3 font-medium">Team</th>
              <th className="py-2 pr-3 font-medium">Lead</th>
              <th className="py-2 pr-3 text-right font-medium">People</th>
              <th className="py-2 pr-3 text-right font-medium">Sub-teams</th>
              <th className="py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-2 pr-3">
                  <span style={{ paddingLeft: `${t.depth * 1.25}rem` }} className="inline-flex items-baseline gap-2">
                    {t.depth > 0 ? <span className="text-neutral-400">↳</span> : null}
                    <span className="font-medium">{t.name}</span>
                    <span className="font-mono text-xs text-neutral-500">{t.slug}</span>
                  </span>
                </td>
                <td className="py-2 pr-3">{t.leadName ?? "—"}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{t.memberCount}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{t.childCount}</td>
                <td className="py-2 text-right">
                  <Link href={`/admin/teams/${t.id}`} className="underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-500">
                  No teams yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
