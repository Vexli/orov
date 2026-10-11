// Walks up a parent chain and reports whether it reaches `target`.
// Used to reject a manager or parent-team change that would create a cycle.
// The `seen` guard keeps the walk finite even if the existing data already contains a cycle.
export function reachesAncestor(
  parentOf: (id: string) => string | null | undefined,
  start: string | null,
  target: string,
): boolean {
  const seen = new Set<string>();
  let current = start;
  while (current !== null && current !== undefined) {
    if (current === target) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parentOf(current) ?? null;
  }
  return false;
}

export interface TeamLeadInfo {
  parentTeamId: string | null;
  leadId: string | null;
}

// The manager a person gets by default (#11): the lead of their primary team. A team's lead is
// usually on the team, so for the lead themself this walks up to the nearest ancestor team with a
// different lead. Null when there's none. Keys are whatever the caller uses (ids, or slugs and
// emails in an import), as long as `personId` and the leads use the same kind.
export function inheritedManager(
  personId: string,
  primaryTeamId: string | null,
  teams: ReadonlyMap<string, TeamLeadInfo>,
): string | null {
  const seen = new Set<string>();
  let current = primaryTeamId;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const team = teams.get(current);
    if (!team) return null;
    if (team.leadId !== null && team.leadId !== personId) return team.leadId;
    current = team.parentTeamId;
  }
  return null;
}

// The teams above `teamIds` that aren't in it: a member of Payroll (under HR) is also an inherited
// member of HR (#23). Cycle-safe.
export function inheritedTeams(
  teamIds: readonly string[],
  parentOf: (teamId: string) => string | null | undefined,
): string[] {
  const explicit = new Set(teamIds);
  const inherited = new Set<string>();
  for (const teamId of teamIds) {
    const seen = new Set<string>([teamId]);
    let parent = parentOf(teamId) ?? null;
    while (parent !== null && !seen.has(parent)) {
      seen.add(parent);
      if (!explicit.has(parent)) inherited.add(parent);
      parent = parentOf(parent) ?? null;
    }
  }
  return [...inherited].sort();
}

// reachesAncestor for a graph where each node can have several parents, such as people with
// several managers (N1): does any path up from `starts` reach `target`? Cycle-safe.
export function reachesAncestorAny(
  parentsOf: (id: string) => readonly string[],
  starts: readonly string[],
  target: string,
): boolean {
  const seen = new Set<string>();
  const queue = [...starts];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...parentsOf(current));
  }
  return false;
}
