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
