import { displayName, teamScope } from "../directory/filter";
import type { DirectoryPerson, DirectoryTeam } from "../directory/model";

// The org chart's two trees (plan.md §7): who reports to whom, and which teams sit inside which.
// They're intentionally separate structures, so each gets its own flat node list in the shape
// d3-org-chart takes: an id and a parent id per node, with exactly one root.

export const ORG_TREES = ["reporting", "team"] as const;
export type OrgTreeKind = (typeof ORG_TREES)[number];

export interface OrgNode {
  id: string;
  parentId: string | null;
  // `root` is the synthetic top node added when the data has more than one top.
  kind: "root" | "person" | "team";
  personId: string | null;
  teamId: string | null;
  label: string;
  // A second line: the person's title, or a team's member count.
  detail: string | null;
}

// Person ids start with `p_` and team ids with `t_`, so this can't collide with either.
export const ORG_ROOT_ID = "root";

// In the team tree a person appears once per team, so the node id names both.
export function memberNodeId(teamId: string, personId: string): string {
  return `${teamId}:${personId}`;
}

export function reportingTree(people: DirectoryPerson[]): OrgNode[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  // A manager who isn't in the list (inactive, so left out of the directory) ends the chain.
  const parents = acyclicParents([...byId.keys()], (id) => {
    const manager = byId.get(id)?.manager;
    return manager && byId.has(manager.id) ? manager.id : null;
  });
  const nodes = sortByLabel(people).map<OrgNode>((p) => ({
    id: p.id,
    parentId: parents.get(p.id) ?? null,
    kind: "person",
    personId: p.id,
    teamId: null,
    label: displayName(p),
    detail: p.title,
  }));
  return withSingleRoot(nodes, "Organization");
}

// Teams nest by parent team, and each team's members hang beneath it. People in no team aren't
// in this tree; the reporting tree still shows them.
export function teamTree(teams: DirectoryTeam[], people: DirectoryPerson[]): OrgNode[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const parents = acyclicParents([...byId.keys()], (id) => {
    const parent = byId.get(id)?.parentTeamId;
    return parent && byId.has(parent) ? parent : null;
  });
  const sortedPeople = sortByLabel(people);
  const nodes: OrgNode[] = [];
  for (const team of [...teams].sort((a, b) => a.name.localeCompare(b.name))) {
    const members = sortedPeople.filter((p) => p.teams.some((t) => t.id === team.id));
    nodes.push({
      id: team.id,
      parentId: parents.get(team.id) ?? null,
      kind: "team",
      personId: null,
      teamId: team.id,
      label: team.name,
      detail: `${members.length} ${members.length === 1 ? "member" : "members"}`,
    });
    for (const p of members) {
      nodes.push({
        id: memberNodeId(team.id, p.id),
        parentId: team.id,
        kind: "person",
        personId: p.id,
        teamId: team.id,
        label: displayName(p),
        detail: p.title,
      });
    }
  }
  return withSingleRoot(nodes, "All teams");
}

export function orgTree(
  kind: OrgTreeKind,
  teams: DirectoryTeam[],
  people: DirectoryPerson[],
): OrgNode[] {
  return kind === "reporting" ? reportingTree(people) : teamTree(teams, people);
}

// The node that stands for a person: themselves in the reporting tree, and their membership of
// their primary team (else their first team) in the team tree. Null if they aren't in it.
export function personNodeId(
  kind: OrgTreeKind,
  person: Pick<DirectoryPerson, "id" | "teams">,
): string | null {
  if (kind === "reporting") return person.id;
  const team = person.teams.find((t) => t.isPrimary) ?? person.teams[0];
  return team ? memberNodeId(team.id, person.id) : null;
}

// The nodes a highlighted team lights up, with the same scope as the directory's team filter:
// its members in the reporting tree. In the team tree, the team itself (and its sub-teams) and
// the member nodes under them; a person's membership of a team outside the scope stays unlit.
export function teamHighlightIds(
  kind: OrgTreeKind,
  teamId: string,
  includeSubteams: boolean,
  teams: DirectoryTeam[],
  people: DirectoryPerson[],
): Set<string> {
  const scope = teamScope(teamId, includeSubteams, teams);
  if (kind === "team") {
    const lit = new Set([...scope].filter((id) => teams.some((t) => t.id === id)));
    for (const p of people) {
      for (const t of p.teams) if (lit.has(t.id)) lit.add(memberNodeId(t.id, p.id));
    }
    return lit;
  }
  return new Set(people.filter((p) => p.teams.some((t) => scope.has(t.id))).map((p) => p.id));
}

// The nodes that start out visible: the root and the two levels below it.
export function initiallyVisible(nodes: OrgNode[], depth = 2): Set<string> {
  const visible = new Set<string>();
  let level = nodes.filter((n) => n.parentId === null).map((n) => n.id);
  for (let d = 0; d <= depth && level.length > 0; d++) {
    for (const id of level) visible.add(id);
    const current = new Set(level);
    level = nodes.filter((n) => n.parentId !== null && current.has(n.parentId)).map((n) => n.id);
  }
  return visible;
}

// What a selection or highlight has to reveal: the selected node and its direct reports, each
// highlighted node, and the members of a highlighted team.
export function nodesToReveal(
  nodes: OrgNode[],
  selectedId: string | null,
  highlightedIds: ReadonlySet<string>,
): Set<string> {
  const teamIds = new Set(nodes.filter((n) => n.kind === "team").map((n) => n.id));
  const open = new Set<string>();
  if (selectedId) open.add(selectedId);
  for (const id of highlightedIds) open.add(id);
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const highlightedTeam = highlightedIds.has(n.parentId) && teamIds.has(n.parentId);
    if (n.parentId === selectedId || highlightedTeam) open.add(n.id);
  }
  return open;
}

// Parents with every cycle cut. The admin forms and import reject cycles, but the chart library
// would throw on one, so a bad row in the data must not take the whole view down. A node found
// on a cycle becomes a root.
function acyclicParents(
  ids: string[],
  parentOf: (id: string) => string | null,
): Map<string, string | null> {
  const parents = new Map(ids.map((id) => [id, parentOf(id)]));
  for (const id of ids) {
    const path = new Set<string>();
    let current: string | null = id;
    while (current !== null && !path.has(current)) {
      path.add(current);
      current = parents.get(current) ?? null;
    }
    if (current !== null) parents.set(current, null);
  }
  return parents;
}

// d3-org-chart needs exactly one root. Several tops (two people with no manager, or two
// top-level teams) go under a synthetic one.
function withSingleRoot(nodes: OrgNode[], label: string): OrgNode[] {
  const tops = nodes.filter((n) => n.parentId === null);
  if (tops.length <= 1) return nodes;
  return [
    {
      id: ORG_ROOT_ID,
      parentId: null,
      kind: "root",
      personId: null,
      teamId: null,
      label,
      detail: null,
    },
    ...nodes.map((n) => (n.parentId === null ? { ...n, parentId: ORG_ROOT_ID } : n)),
  ];
}

function sortByLabel(people: DirectoryPerson[]): DirectoryPerson[] {
  return [...people].sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

export interface ChainLink {
  id: string;
  name: string;
  // False for a manager who isn't in the directory (inactive), who can't be selected.
  inDirectory: boolean;
}

// Who someone reports to, from the top down, ending with the person (U3: Jane → Max → Bob).
// Stops at a manager missing from the directory, and at a cycle in the data.
export function managementChain(personId: string, people: DirectoryPerson[]): ChainLink[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const chain: ChainLink[] = [];
  const seen = new Set<string>();
  let current = byId.get(personId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push({ id: current.id, name: displayName(current), inDirectory: true });
    const manager = current.manager;
    if (!manager) break;
    current = byId.get(manager.id);
    if (!current) chain.push({ id: manager.id, name: manager.name, inDirectory: false });
  }
  return chain.reverse();
}
