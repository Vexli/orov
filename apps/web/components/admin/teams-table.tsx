"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueryStates } from "nuqs";
import { filterAdminTeams } from "@orov/core/admin/filter";
import { adminTeamsParsers } from "@/lib/url-state";

export interface TeamsTableRow {
  id: string;
  slug: string;
  name: string;
  parentTeamId: string | null;
  leadName: string | null;
  memberCount: number;
  childCount: number;
  // Nesting level in the depth-first order the rows arrive in.
  depth: number;
}

// The admin teams list. A search keeps each match's parent teams, muted, so the indentation still
// shows where the match sits.
export function TeamsTable({ rows }: { rows: TeamsTableRow[] }) {
  const [{ q }, setParams] = useQueryStates(adminTeamsParsers, { history: "replace" });
  const { visible, matched } = useMemo(() => filterAdminTeams(rows, q), [rows, q]);
  const shown = rows.filter((t) => visible.has(t.id));

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search teams"
          placeholder="Search name or slug"
          value={q}
          onChange={(e) => setParams({ q: e.target.value || null })}
          className="min-w-64 flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        />
        <span role="status" className="text-sm text-muted-fg">
          {q ? `${matched.size} of ${rows.length} match` : `${rows.length} teams`}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
            <tr>
              <th className="py-2 pr-3 font-medium">Team</th>
              <th className="py-2 pr-3 font-medium">Lead</th>
              <th className="py-2 pr-3 text-right font-medium">People</th>
              <th className="py-2 pr-3 text-right font-medium">Sub-teams</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr
                key={t.id}
                className={`border-b border-border ${matched.has(t.id) ? "" : "text-muted-fg"}`}
              >
                <td className="py-2 pr-3">
                  <span
                    style={{ paddingLeft: `${t.depth * 1.25}rem` }}
                    className="inline-flex items-baseline gap-2"
                  >
                    {t.depth > 0 ? <span className="text-muted-fg">↳</span> : null}
                    <span className="font-medium">{t.name}</span>
                    <span className="font-mono text-xs text-muted-fg">{t.slug}</span>
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
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-fg">
                  {rows.length === 0 ? "No teams yet." : "No team matches."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
