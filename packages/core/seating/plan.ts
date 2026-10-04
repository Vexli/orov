// The seating planner (N10): seat each team together across one office's desks. Pure, so it runs
// the same in tests and on the server; the result is a proposal the admin reviews before anything
// is written.

export interface PlanDesk {
  id: string;
  // Floors in the office's order; a team spills onto another floor only when it must.
  floorIndex: number;
  areaId: string | null;
  // The desk's centre in its floor drawing's units.
  x: number;
  y: number;
}

export interface PlanPerson {
  id: string;
  name: string;
  // The group to seat together; null for people in no team, who are seated last.
  teamId: string | null;
  currentDeskId: string | null;
  // Keeps their current desk, and pulls their team towards it.
  locked: boolean;
}

export interface SeatingResult {
  // Person id → desk id, for everyone who gets a desk.
  assignments: Map<string, string>;
  // People there wasn't a desk for (more people than desks).
  unseated: string[];
}

// Costs, in drawing units: changing floor outweighs any distance on a floor, and changing area
// outweighs most of them. Keeping one's current desk is worth a little, so the plan doesn't move
// people for nothing.
const FLOOR_COST = 1_000_000;
const AREA_COST = 400;
const STAY_BONUS = 60;

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function planSeating(desks: PlanDesk[], people: PlanPerson[]): SeatingResult {
  const deskById = new Map(desks.map((d) => [d.id, d]));
  const free = new Set(desks.map((d) => d.id));
  const assignments = new Map<string, string>();

  for (const p of people) {
    if (p.locked && p.currentDeskId && free.has(p.currentDeskId)) {
      assignments.set(p.id, p.currentDeskId);
      free.delete(p.currentDeskId);
    }
  }

  // Teams in order of size, largest first, so big teams get contiguous space; no-team last.
  const groups = new Map<string | null, PlanPerson[]>();
  for (const p of people) {
    if (assignments.has(p.id)) continue;
    groups.set(p.teamId, [...(groups.get(p.teamId) ?? []), p]);
  }
  const lockedOf = (teamId: string | null) =>
    people.filter((p) => p.teamId === teamId && assignments.has(p.id)).map((p) => deskById.get(assignments.get(p.id)!)!);
  const order = [...groups.keys()].sort((a, b) => {
    if (a === null || b === null) return a === null ? 1 : -1;
    return groups.get(b)!.length + lockedOf(b).length - (groups.get(a)!.length + lockedOf(a).length) || a.localeCompare(b);
  });

  const unseated: string[] = [];
  for (const teamId of order) {
    const seated = lockedOf(teamId);
    const members = [...groups.get(teamId)!].sort((a, b) => a.name.localeCompare(b.name));
    for (const person of members) {
      // The team's centre so far, or the first free desk in office order for a new cluster.
      const anchor = seated.length > 0 ? centroid(seated) : startFor(desks, free, members.length);
      if (!anchor) {
        unseated.push(person.id);
        continue;
      }
      let best: PlanDesk | null = null;
      let bestCost = Infinity;
      for (const id of free) {
        const desk = deskById.get(id)!;
        const cost =
          Math.abs(desk.floorIndex - anchor.floorIndex) * FLOOR_COST +
          (desk.areaId !== anchor.areaId ? AREA_COST : 0) +
          distance(desk, anchor) -
          (desk.id === person.currentDeskId ? STAY_BONUS : 0);
        if (cost < bestCost || (cost === bestCost && best !== null && desk.id < best.id)) {
          best = desk;
          bestCost = cost;
        }
      }
      if (!best) {
        unseated.push(person.id);
        continue;
      }
      assignments.set(person.id, best.id);
      free.delete(best.id);
      seated.push(best);
    }
  }
  return { assignments, unseated };
}

// The team's centre: its most common floor and area, and the mean position on that floor.
function centroid(desks: PlanDesk[]): PlanDesk {
  const mode = <T,>(values: T[]) => {
    const counts = new Map<T, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  };
  const floorIndex = mode(desks.map((d) => d.floorIndex));
  const onFloor = desks.filter((d) => d.floorIndex === floorIndex);
  return {
    id: "",
    floorIndex,
    areaId: mode(onFloor.map((d) => d.areaId)),
    x: onFloor.reduce((sum, d) => sum + d.x, 0) / onFloor.length,
    y: onFloor.reduce((sum, d) => sum + d.y, 0) / onFloor.length,
  };
}

// Where a new team starts: the first area (floor by floor, in reading order) with a free desk
// for every member, or else the area with the most free desks, so a team isn't split across
// areas just because the first free desk is the last one in its area.
function startFor(desks: PlanDesk[], free: Set<string>, size: number): PlanDesk | null {
  const open = desks
    .filter((d) => free.has(d.id))
    .sort((a, b) => a.floorIndex - b.floorIndex || a.y - b.y || a.x - b.x);
  const areas = new Map<string, PlanDesk[]>();
  for (const d of open) {
    const key = `${d.floorIndex}|${d.areaId}`;
    areas.set(key, [...(areas.get(key) ?? []), d]);
  }
  const groups = [...areas.values()];
  const roomy = groups.find((g) => g.length >= size) ?? groups.sort((a, b) => b.length - a.length)[0];
  return roomy?.[0] ?? null;
}
