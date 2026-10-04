import { eq, isNotNull, isNull } from "drizzle-orm";
import type { Executor } from "../client";
import * as s from "../schema";

export interface DeskOption {
  id: string;
  name: string;
  label: string;
  floorId: string;
  // Connects the option to its shape in the floor drawing, for the seat picker.
  svgElementId: string;
  assignedPersonId: string | null;
  assignedPersonName: string | null;
  // False when someone else holds the seat, so the picker can show it as taken.
  available: boolean;
  locationName: string;
  // The office's time zone, which a person on this desk gets when theirs is blank.
  timezone: string;
}

// Desks on active floors. A desk held by `currentPersonId` counts as available to them.
export async function listDeskOptions(db: Executor, currentPersonId?: string): Promise<DeskOption[]> {
  const desks = await db.query.space.findMany({
    where: eq(s.space.kind, "desk"),
    with: { floor: { with: { location: { columns: { name: true, timezone: true } } } } },
    orderBy: (sp, { asc }) => [asc(sp.name)],
  });
  const holders = await db
    .select({ personId: s.person.id, name: s.person.name, deskId: s.person.assignedDeskId })
    .from(s.person)
    .where(isNotNull(s.person.assignedDeskId));
  const holderByDesk = new Map(holders.map((h) => [h.deskId, h]));

  return desks
    .filter((d) => d.archivedAt === null && d.floor.archivedAt === null)
    .map((d) => {
      const holder = holderByDesk.get(d.id);
      const assignedPersonId = holder?.personId ?? null;
      return {
        id: d.id,
        name: d.name,
        label: `${d.name} · ${d.floor.location.name}, ${d.floor.name}`,
        floorId: d.floorId,
        svgElementId: d.svgElementId,
        assignedPersonId,
        assignedPersonName: holder?.name ?? null,
        available: assignedPersonId === null || assignedPersonId === currentPersonId,
        locationName: d.floor.location.name,
        timezone: d.floor.location.timezone,
      };
    });
}

export interface PickerFloor {
  id: string;
  label: string;
  assetId: string;
  svg: string;
}

// The current drawing of every active floor that has one, for the seat picker's mini-map.
export async function listPickerFloors(db: Executor): Promise<PickerFloor[]> {
  const rows = await db
    .select({
      id: s.floor.id,
      floorName: s.floor.name,
      locationName: s.location.name,
      assetId: s.svgAsset.id,
      svg: s.svgAsset.sanitizedSvg,
    })
    .from(s.floor)
    .innerJoin(s.location, eq(s.location.id, s.floor.locationId))
    .innerJoin(s.svgAsset, eq(s.svgAsset.id, s.floor.svgAssetId))
    .where(isNull(s.floor.archivedAt))
    .orderBy(s.location.sortOrder, s.location.name, s.floor.sortOrder, s.floor.level);
  return rows.map((r) => ({
    id: r.id,
    label: `${r.locationName}, ${r.floorName}`,
    assetId: r.assetId,
    svg: r.svg,
  }));
}
