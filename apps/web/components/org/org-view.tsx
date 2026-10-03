"use client";

import { useMemo } from "react";
import { useQueryStates } from "nuqs";
import type { DirectoryPerson, DirectoryTeam } from "@officeorg/core/directory/model";
import { orgTree, personNodeId, type OrgNode } from "@officeorg/core/org/tree";
import { PersonCard } from "@/components/directory/person-card";
import { orgParsers } from "@/lib/url-state";
import { OrgChart } from "./org-chart";
import { OrgOutline } from "./org-outline";

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

  function select(node: OrgNode) {
    if (node.personId) void setParams({ person: node.personId });
  }

  const label = `${TREE_LABEL[params.tree]} chart`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label="Org chart" className="min-w-0">
        <h1 className="text-xl font-heading">Org chart</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
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
        <div className="mt-4">
          {params.view === "list" ? (
            <OrgOutline
              nodes={nodes}
              label={label}
              selectedId={selectedId}
              highlightedIds={NONE}
              onSelect={select}
            />
          ) : (
            <OrgChart
              nodes={nodes}
              selectedId={selectedId}
              highlightedIds={NONE}
              label={label}
              onSelect={select}
            />
          )}
        </div>
      </section>

      <div className="lg:sticky lg:top-6 lg:self-start">
        {selectedPerson ? (
          <PersonCard
            person={selectedPerson}
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

const pill = (active: boolean) =>
  `rounded-md border px-2.5 py-1 text-sm ${
    active ? "border-primary bg-primary text-primary-fg" : "border-border hover:bg-muted"
  }`;
