import type { SearchParams } from "nuqs/server";
import { MapView } from "@/components/map/map-view";
import { getDb } from "@officeorg/db/client";
import { loadDirectory } from "@officeorg/db/queries/directory";
import { loadMap } from "@officeorg/db/queries/map";
import { loadMapParams } from "@/lib/url-state";
import { requireUser } from "@/lib/session";

export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const { loc, floor, person } = loadMapParams(await searchParams);
  const db = getDb();
  const [map, directory] = await Promise.all([
    loadMap(db, { loc, floor, person }, user.regionDisplay),
    loadDirectory(db, user.regionDisplay),
  ]);
  return <MapView map={map} people={directory.people} teams={directory.teams} />;
}
