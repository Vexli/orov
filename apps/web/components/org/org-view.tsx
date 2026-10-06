"use client";

import { useMemo } from "react";
import { useQueryStates } from "nuqs";
import type { DirectoryPerson, DirectoryTeam } from "@orov/core/directory/model";
import { displayName } from "@orov/core/directory/filter";
import {
  managementChain,
  orgTree,
  personNodeId,
  teamHighlightIds,
  type ChainLink,
  type OrgNode,
} from "@orov/core/org/tree";
import { PersonCard } from "@/components/directory/person-card";
import { orgParsers } from "@/lib/url-state";
import { OrgChart } from "./org-chart";
import { FLOATING_PANEL_GUTTER, FloatingPanel, ViewBar } from "../view-bar";
import { OrgOutline } from "./org-outline";
import { sortByName } from "@orov/core/people/names";

interface Props {
  people: DirectoryPerson[];
  teams: DirectoryTeam[];
}

const TREE_LABEL = { reporting: "Reporting lines", team: "Teams" } as const;
const NONE: ReadonlySet<string> = new Set();

export function OrgView({ people, teams }: Props) {
  const [params, setParams] = useQueryStates(orgParsers, { history: "replace" });

  const nodes = useMemo(() => orgTree(params.tree, teams, people), [params.tree, teams, people]);
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const selectedPerson = params.person ? (peopleById.get(params.person) ?? null) : null;
  const selectedId = selectedPerson ? personNodeId(params.tree, selectedPerson) : null;
  const chain = useMemo(
    () => (selectedPerson ? managementChain(selectedPerson.id, people) : []),
    [selectedPerson, people],
  );

  // The same team scope as the directory filter and the map highlight (U2).
  const highlightedIds = useMemo(
    () =>
      params.team ? teamHighlightIds(params.tree, params.team, params.sub, teams, people) : NONE,
    [params.tree, params.team, params.sub, teams, people],
  );
  const team = teams.find((t) => t.id === params.team) ?? null;
  const teamPeople = useMemo(
    () =>
      // People, not nodes: someone with several managers has more than one node (N1).
      params.team
        ? [...teamHighlightIds("reporting", params.team, params.sub, teams, people)].filter(
            (id) => !id.includes(">"),
          ).length
        : 0,
    [params.team, params.sub, teams, people],
  );

  // A person selects them. A team node highlights that team, keeping the sub-teams choice.
  function select(node: OrgNode) {
    if (node.personId) void setParams({ person: node.personId });
    else if (node.teamId) void setParams({ team: node.teamId });
  }

  const label = `${TREE_LABEL[params.tree]} chart`;

  return (
    <>
      {/* The chart's own controls, in the bar under the main menu (N4). */}
      <ViewBar label="Org chart filters">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div role="group" aria-label="Tree" className="flex gap-1">
            {(["reporting", "team"] as const).map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={params.tree === t}
                onClick={() => setParams({ tree: t === "reporting" ? null : t })}
                className={pill(params.tree === t)}
              >
                {TREE_LABEL[t]}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Display" className="flex gap-1">
            {(["chart", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={params.view === v}
                onClick={() => setParams({ view: v === "chart" ? null : v })}
                className={pill(params.view === v)}
              >
                {v === "chart" ? "Chart" : "List"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <select
            aria-label="Highlight team"
            value={params.team ?? ""}
            onChange={(e) =>
              setParams({ team: e.target.value || null, sub: e.target.value ? params.sub : null })
            }
            className="rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
          >
            <option value="">Highlight a team…</option>
            {sortByName(teams).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={params.sub}
              disabled={!params.team}
              onChange={(e) => setParams({ sub: e.target.checked })}
            />
            Include sub-teams
          </label>
          {team ? (
            <p role="status" aria-label="Highlighted team" className="font-medium">
              {team.name}
              {params.sub ? " and sub-teams" : ""}: {teamPeople}{" "}
              {teamPeople === 1 ? "person" : "people"}
            </p>
          ) : null}
        </div>
      </ViewBar>
      {/* Full width (N2) and the height left under the menus (Phase 8); the card floats at the
          right while someone is selected, and the gutter keeps the chart clear of it. */}
      <section
        aria-label="Org chart"
        className={`flex min-h-0 min-w-0 flex-1 flex-col ${selectedPerson ? FLOATING_PANEL_GUTTER : ""}`}
      >
        <h1 className="shrink-0 text-xl font-heading">Org chart</h1>
        <div className={`mt-4 min-h-0 flex-1 ${params.view === "list" ? "overflow-y-auto" : ""}`}>
          {params.view === "list" ? (
            <OrgOutline
              nodes={nodes}
              label={label}
              selectedId={selectedId}
              highlightedIds={highlightedIds}
              onSelect={select}
            />
          ) : (
            <OrgChart
              nodes={nodes}
              selectedId={selectedId}
              highlightedIds={highlightedIds}
              label={label}
              onSelect={select}
            />
          )}
        </div>
      </section>

      {selectedPerson ? (
        <FloatingPanel belowBar>
          {!selectedId ? (
            <p role="note" className="rounded-md bg-muted p-3 text-sm">
              {displayName(selectedPerson)} isn&apos;t in any team, so they aren&apos;t in the team
              tree.
            </p>
          ) : null}
          <PersonCard
            person={selectedPerson}
            onSelectPerson={(id) => setParams({ person: id })}
            onClose={() => setParams({ person: null })}
          />
          <ReportingLine chain={chain} onSelect={(id) => setParams({ person: id })} />
        </FloatingPanel>
      ) : null}
    </>
  );
}

// U3: who the selected person reports to, all the way up.
function ReportingLine({
  chain,
  onSelect,
}: {
  chain: ChainLink[];
  onSelect: (id: string) => void;
}) {
  const person = chain.at(-1);
  if (!person) return null;
  return (
    <section aria-label="Reporting line" className="rounded-lg border border-border p-5 text-sm">
      <h2 className="text-xs uppercase tracking-wide text-muted-fg">Reporting line</h2>
      {chain.length === 1 ? (
        <p className="mt-1">{person.name} doesn&apos;t report to anyone.</p>
      ) : (
        <ol className="mt-2 space-y-1">
          {chain.map((link, i) => {
            const last = i === chain.length - 1;
            return (
              <li key={link.id} style={{ paddingLeft: `${i * 0.75}rem` }}>
                {i > 0 ? <span aria-hidden="true">↳ </span> : null}
                {last ? (
                  <span aria-current="true" className="font-medium">
                    {link.name}
                  </span>
                ) : link.inDirectory ? (
                  <button
                    type="button"
                    onClick={() => onSelect(link.id)}
                    className="underline underline-offset-4"
                  >
                    {link.name}
                  </button>
                ) : (
                  <span className="text-muted-fg">{link.name} (inactive)</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

const pill = (active: boolean) =>
  `rounded-md border px-2.5 py-1 text-sm ${
    active ? "border-primary bg-primary text-primary-fg" : "border-border hover:bg-muted"
  }`;
