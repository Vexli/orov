import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  DEFAULT_REGION_DISPLAY,
  formatRegion,
  type MapData,
  type MapSeat,
  type RegionDisplay,
} from "@officeorg/core";
import type { Executor } from "../client";
import * as s from "../schema";

export interface MapTarget {
  // Location and floor slugs from the URL. Either may be missing or stale.
  loc: string | null;
  floor: string | null;
}

// Everything the map needs in one read: the office and floor list for navigation, the chosen
// floor's drawing, areas and spaces, and every assigned seat on every floor. Archived floors and
// spaces are left out. An unknown slug falls back to the first floor that has a drawing, so an
// old link still opens a map.
export async function loadMap(
  db: Executor,
  target: MapTarget,
  regionDisplay: RegionDisplay = DEFAULT_REGION_DISPLAY,
): Promise<MapData> {
  const locationRows = await db.query.location.findMany({
    orderBy: (l, { asc }) => [asc(l.sortOrder), asc(l.name)],
    with: {
      floors: {
        where: (f, { isNull }) => isNull(f.archivedAt),
        orderBy: (f, { asc }) => [asc(f.sortOrder), asc(f.level)],
      },
    },
  });

  const counts = await db
    .select({ floorId: s.space.floorId, kind: s.space.kind })
    .from(s.space)
    .where(isNull(s.space.archivedAt));
  const count = (floorId: string, kinds: string[]) =>
    counts.filter((c) => c.floorId === floorId && kinds.includes(c.kind)).length;

  const locations = locationRows.map((l) => ({
    slug: l.slug,
    name: l.name,
    regionLabel: formatRegion(l.region, regionDisplay),
    floors: l.floors.map((f) => ({
      slug: f.slug,
      name: f.name,
      level: f.level,
      hasDrawing: f.svgAssetId !== null,
      deskCount: count(f.id, ["desk"]),
      roomCount: count(f.id, ["meeting_room", "phone_booth"]),
    })),
  }));

  const drawn = locationRows.flatMap((l) =>
    l.floors.filter((f) => f.svgAssetId).map((f) => ({ l, f })),
  );
  const pick =
    drawn.find(({ l, f }) => l.slug === target.loc && f.slug === target.floor) ??
    drawn.find(({ l }) => l.slug === target.loc) ??
    drawn[0];

  const seats = await loadSeats(db);

  if (!pick) return { locations, floor: null, seats };

  const { l: location, f: floor } = pick;
  const [asset, areas, spaces] = await Promise.all([
    db.query.svgAsset.findFirst({ where: eq(s.svgAsset.id, floor.svgAssetId!) }),
    db.query.area.findMany({
      where: eq(s.area.floorId, floor.id),
      orderBy: (a, { asc }) => [asc(a.name)],
    }),
    db.query.space.findMany({
      where: and(eq(s.space.floorId, floor.id), isNull(s.space.archivedAt)),
      orderBy: (sp, { asc }) => [asc(sp.name)],
    }),
  ]);

  return {
    locations,
    seats,
    floor: {
      id: floor.id,
      slug: floor.slug,
      name: floor.name,
      locationSlug: location.slug,
      locationName: location.name,
      assetId: asset!.id,
      svg: asset!.sanitizedSvg,
      areas: areas.map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        svgElementId: a.svgElementId,
      })),
      spaces: spaces.map((sp) => ({
        id: sp.id,
        svgElementId: sp.svgElementId,
        kind: sp.kind,
        name: sp.name,
        capacity: sp.capacity,
        areaId: sp.areaId,
      })),
    },
  };
}

// Every active person's desk, with enough of its floor and area to navigate there.
async function loadSeats(db: Executor): Promise<MapSeat[]> {
  const rows = await db
    .select({
      personId: s.person.id,
      spaceId: s.space.id,
      svgElementId: s.space.svgElementId,
      deskName: s.space.name,
      floorSlug: s.floor.slug,
      floorName: s.floor.name,
      locationSlug: s.location.slug,
      locationName: s.location.name,
      areaSlug: s.area.slug,
    })
    .from(s.person)
    .innerJoin(s.space, eq(s.space.id, s.person.assignedDeskId))
    .innerJoin(s.floor, eq(s.floor.id, s.space.floorId))
    .innerJoin(s.location, eq(s.location.id, s.floor.locationId))
    .leftJoin(s.area, eq(s.area.id, s.space.areaId))
    .where(
      and(
        eq(s.person.active, true),
        isNotNull(s.person.assignedDeskId),
        isNull(s.floor.archivedAt),
      ),
    )
    .orderBy(s.space.name);
  return rows;
}
