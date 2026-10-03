import type { ParsedArea, ParsedFloor, ParsedSpace, SpaceKind } from "./parse";

// Compares a parsed drawing with the floor's current areas and spaces (plan.md §6, step 3).
// Plain data in and out, so the admin page can show it and the apply step can re-run it inside
// its transaction.

export interface ExistingArea {
  id: string;
  svgElementId: string;
  name: string;
}

export interface ExistingSpace {
  id: string;
  svgElementId: string;
  kind: SpaceKind;
  name: string;
  areaId: string | null;
  archived: boolean;
  // The person whose desk this is, if anyone's.
  assignedTo: { personId: string; name: string } | null;
}

export interface FloorDiff {
  errors: string[];
  areas: {
    added: ParsedArea[];
    unchanged: ExistingArea[];
    removed: ExistingArea[];
  };
  spaces: {
    // New, or `restoreId` when an archived space with the same id comes back.
    added: (ParsedSpace & { restoreId: string | null })[];
    unchanged: ExistingSpace[];
    // Same space, different area. Area ids are svg ids, because a new area has no row yet.
    moved: { space: ExistingSpace; from: string | null; to: string | null }[];
    removedUnassigned: ExistingSpace[];
    removedAssigned: ExistingSpace[];
  };
}

export function diffFloor(
  parsed: ParsedFloor,
  existing: { areas: ExistingArea[]; spaces: ExistingSpace[] },
): FloorDiff {
  const parsedAreaIds = new Set(parsed.areas.map((a) => a.svgElementId));
  const existingAreaBySvg = new Map(existing.areas.map((a) => [a.svgElementId, a]));
  const areaSvgById = new Map(existing.areas.map((a) => [a.id, a.svgElementId]));

  const areas: FloorDiff["areas"] = {
    added: parsed.areas.filter((a) => !existingAreaBySvg.has(a.svgElementId)),
    unchanged: existing.areas.filter((a) => parsedAreaIds.has(a.svgElementId)),
    removed: existing.areas.filter((a) => !parsedAreaIds.has(a.svgElementId)),
  };

  const parsedSpaceBySvg = new Map(parsed.spaces.map((s) => [s.svgElementId, s]));
  const existingSpaceBySvg = new Map(existing.spaces.map((s) => [s.svgElementId, s]));
  const spaces: FloorDiff["spaces"] = {
    added: [],
    unchanged: [],
    moved: [],
    removedUnassigned: [],
    removedAssigned: [],
  };

  for (const space of parsed.spaces) {
    const current = existingSpaceBySvg.get(space.svgElementId);
    if (!current || current.archived) {
      spaces.added.push({ ...space, restoreId: current?.id ?? null });
      continue;
    }
    const from = current.areaId ? (areaSvgById.get(current.areaId) ?? null) : null;
    if (from === space.areaSvgElementId) spaces.unchanged.push(current);
    else spaces.moved.push({ space: current, from, to: space.areaSvgElementId });
  }

  for (const current of existing.spaces) {
    if (current.archived || parsedSpaceBySvg.has(current.svgElementId)) continue;
    if (current.assignedTo) spaces.removedAssigned.push(current);
    else spaces.removedUnassigned.push(current);
  }

  return { errors: parsed.errors, areas, spaces };
}

export function hasChanges(diff: FloorDiff): boolean {
  return (
    diff.areas.added.length > 0 ||
    diff.areas.removed.length > 0 ||
    diff.spaces.added.length > 0 ||
    diff.spaces.moved.length > 0 ||
    diff.spaces.removedUnassigned.length > 0 ||
    diff.spaces.removedAssigned.length > 0
  );
}
