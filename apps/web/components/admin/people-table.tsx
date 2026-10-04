"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueryStates } from "nuqs";
import { filterAdminPeople, type AdminPersonRow } from "@officeorg/core/admin/filter";
import { adminPeopleParsers } from "@/lib/url-state";
import { TeamChip } from "../team-chip";

export interface PeopleTableRow extends AdminPersonRow {
  id: string;
  teams: { id: string; name: string; isPrimary: boolean; inherited: boolean }[];
}

interface Props {
  people: PeopleTableRow[];
  teams: { id: string; name: string; parentTeamId: string | null }[];
}

const controlClass = "rounded-md border border-border bg-transparent px-3 py-2 text-sm";

// The admin people list with the directory's kind of filters, kept in the URL so a filtered
// list can be shared or reloaded.
export function PeopleTable({ people, teams }: Props) {
  const [params, setParams] = useQueryStates(adminPeopleParsers, { history: "replace" });
  const { q, team, sub, status, desk } = params;

  const rows = useMemo(
    () => filterAdminPeople(people, { q, teamId: team, includeSubteams: sub, status, desk }, teams),
    [people, teams, q, team, sub, status, desk],
  );
  const hasFilters = q !== "" || team !== null || status !== "active" || desk !== "any";

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Search people"
          placeholder="Search name, email, title, manager or desk"
          value={q}
          onChange={(e) => setParams({ q: e.target.value || null })}
          className={`${controlClass} min-w-64 flex-1`}
        />
        <select
          aria-label="Filter by team"
          value={team ?? ""}
          onChange={(e) => setParams({ team: e.target.value || null })}
          className={controlClass}
        >
          <option value="">All teams</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sub}
            disabled={!team}
            onChange={(e) => setParams({ sub: e.target.checked })}
          />
          Include sub-teams
        </label>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setParams({ status: e.target.value as typeof status })}
          className={controlClass}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">Active and inactive</option>
        </select>
        <select
          aria-label="Filter by desk"
          value={desk}
          onChange={(e) => setParams({ desk: e.target.value as typeof desk })}
          className={controlClass}
        >
          <option value="any">With or without a desk</option>
          <option value="with">Has a desk</option>
          <option value="without">No desk</option>
        </select>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-fg">
        <span role="status">
          Showing {rows.length} of {people.length}
        </span>
        {hasFilters ? (
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => setParams({ q: null, team: null, sub: null, status: null, desk: null })}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-fg">
            <tr>
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Title</th>
              <th className="py-2 pr-3 font-medium">Teams</th>
              <th className="py-2 pr-3 font-medium">Manager</th>
              <th className="py-2 pr-3 font-medium">Desk</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-b border-border">
                <td className="py-2 pr-3">
                  {/* Struck through so inactive people stand out at a glance; the hidden text says
                      the same to screen readers, which don't announce styling. */}
                  <div
                    className={p.active ? "font-medium" : "font-medium text-muted-fg line-through"}
                  >
                    {p.name}
                    {p.active ? null : <span className="sr-only"> (inactive)</span>}
                  </div>
                  <div className="text-xs text-muted-fg">{p.email}</div>
                </td>
                <td className="py-2 pr-3 text-muted-fg">{p.title ?? "—"}</td>
                <td className="py-2 pr-3">
                  {p.teams.length === 0
                    ? "—"
                    : p.teams.map((t) => <TeamChip key={t.id} team={t} className="mr-1" />)}
                </td>
                <td className="py-2 pr-3">{p.managerName ?? "—"}</td>
                <td className="py-2 pr-3 font-mono text-xs">{p.deskName ?? "—"}</td>
                <td className="py-2 pr-3">
                  {p.active ? "Active" : <span className="text-muted-fg">Inactive</span>}
                </td>
                <td className="py-2 text-right">
                  <Link href={`/admin/people/${p.id}`} className="underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted-fg">
                  No one matches these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
