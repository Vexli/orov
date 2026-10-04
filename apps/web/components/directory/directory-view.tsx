"use client";

import { useEffect, useMemo } from "react";
import { useQueryStates } from "nuqs";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { DirectoryPerson, DirectoryTeam } from "@officeorg/core/directory/model";
import {
  displayName,
  filterDirectory,
  locationText,
  type DirectoryFilters,
} from "@officeorg/core/directory/filter";
import { directoryParsers } from "@/lib/url-state";
import { LocationLabel } from "./location-label";
import { TeamChip } from "../team-chip";
import { PersonCard } from "./person-card";
import { sortByName } from "@officeorg/core/people/names";

interface Props {
  people: DirectoryPerson[];
  teams: DirectoryTeam[];
  locations: { slug: string; name: string }[];
}

// Cells reach the selection setter through the table's meta, so the columns never close over
// component state and can live at module scope.
interface TableMeta {
  selectPerson: (id: string) => void;
}

const helper = createColumnHelper<DirectoryPerson>();

// TanStack Table needs `columns` and `data` to keep the same reference between renders. A new
// array each render makes it queue internal state resets, which re-render, which build a new
// array again: an endless render loop that freezes the page on the first keystroke.
const columns = [
  helper.accessor((p) => displayName(p), {
    id: "name",
    header: "Name",
    cell: (info) => (
      <button
        type="button"
        onClick={() => (info.table.options.meta as TableMeta).selectPerson(info.row.original.id)}
        className="text-left"
      >
        <span className="block font-medium">{info.getValue()}</span>
        <span className="block text-xs text-muted-fg">{info.row.original.email}</span>
      </button>
    ),
  }),
  helper.accessor((p) => p.title ?? "", {
    id: "title",
    header: "Title",
    cell: (info) => <span className="text-muted-fg">{info.getValue() || "—"}</span>,
  }),
  helper.accessor((p) => p.teams.map((t) => t.name).join(", "), {
    id: "teams",
    header: "Teams",
    cell: (info) => (
      <ul className="flex flex-wrap gap-1">
        {info.row.original.teams.map((t) => (
          <li key={t.id}>
            <TeamChip team={t} />
          </li>
        ))}
      </ul>
    ),
  }),
  helper.accessor((p) => locationText(p), {
    id: "location",
    header: "Location",
    cell: (info) => <LocationLabel person={info.row.original} linkDesk />,
  }),
];

export function DirectoryView({ people, teams, locations }: Props) {
  // history: "replace" keeps the back button for leaving the page, not for every filter tweak.
  const [params, setParams] = useQueryStates(directoryParsers, { history: "replace" });
  const { q, team, sub, loc, desk } = params;

  // Memoized on the primitive filter values, so `rows` keeps its reference until a filter changes.
  const rows = useMemo(() => {
    const filters: DirectoryFilters = {
      q,
      teamId: team,
      includeSubteams: sub,
      locationSlug: loc,
      hasDesk: desk,
    };
    return filterDirectory(people, filters, teams);
  }, [people, teams, q, team, sub, loc, desk]);

  const selected = params.person ? (people.find((p) => p.id === params.person) ?? null) : null;

  // When the person comes from the URL (a shared link, or a back-navigation), bring their row into view.
  useEffect(() => {
    if (!params.person) return;
    document.getElementById(`person-row-${params.person}`)?.scrollIntoView({ block: "nearest" });
  }, [params.person]);

  const meta = useMemo<TableMeta>(
    () => ({ selectPerson: (id) => setParams({ person: id }) }),
    [setParams],
  );

  // The React Compiler can't memoize TanStack Table, so the lint rule flags this call. Stable
  // `data` and `columns` above are what keep it from re-rendering in a loop.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns, meta, getCoreRowModel: getCoreRowModel() });

  const hasFilters = params.q !== "" || params.team !== null || params.loc !== null || params.desk;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="People directory" className="min-w-0">
        <h1 className="text-xl font-heading">Directory</h1>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
          <input
            type="search"
            aria-label="Search people"
            placeholder="Search name, title, email or seat"
            value={params.q}
            onChange={(e) => setParams({ q: e.target.value || null })}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          />
          <select
            aria-label="Filter by team"
            value={params.team ?? ""}
            onChange={(e) => setParams({ team: e.target.value || null })}
            className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
          >
            <option value="">All teams</option>
            {sortByName(teams).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={params.sub}
              disabled={!params.team}
              onChange={(e) => setParams({ sub: e.target.checked })}
            />
            Include sub-teams
          </label>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select
              aria-label="Filter by location"
              value={params.loc ?? ""}
              onChange={(e) => setParams({ loc: e.target.value || null })}
              className="rounded-md border border-border bg-transparent px-3 py-2 text-sm"
            >
              <option value="">All locations</option>
              {locations.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={params.desk}
                onChange={(e) => setParams({ desk: e.target.checked })}
              />
              Has a desk
            </label>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-muted-fg">
          <span role="status">
            Showing {rows.length} of {people.length}
          </span>
          {hasFilters ? (
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => setParams({ q: null, team: null, sub: null, loc: null, desk: null })}
            >
              Clear filters
            </button>
          ) : null}
        </div>

        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-muted text-xs uppercase text-muted-fg">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id} className="px-3 py-2 font-medium">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isSelected = row.original.id === params.person;
                return (
                  // The whole row is a click target for pointer users. The name button stays the
                  // keyboard and screen reader route, so rows aren't focusable themselves. A click
                  // on a link or button inside (the desk link) does its own thing instead.
                  <tr
                    key={row.id}
                    id={`person-row-${row.original.id}`}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={(e) => {
                      if ((e.target as Element).closest("a,button,input,select")) return;
                      meta.selectPerson(row.original.id);
                    }}
                    className={`cursor-pointer border-b border-border align-top last:border-0 ${
                      isSelected ? "bg-accent" : "hover:bg-muted"
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-fg">
                    No one matches these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="lg:sticky lg:top-6 lg:self-start">
        {selected ? (
          <PersonCard
            person={selected}
            onSelectPerson={(id) => setParams({ person: id })}
            onClose={() => setParams({ person: null })}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-fg">
            Select someone to see their card.
          </p>
        )}
      </div>
    </div>
  );
}
