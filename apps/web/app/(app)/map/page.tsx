import type { SearchParams } from "nuqs/server";
import { MapView } from "@/components/map/map-view";
import { getDb } from "@orov/db/client";
import { loadDirectory } from "@orov/db/queries/directory";
import { loadMap } from "@orov/db/queries/map";
import { loadMapParams } from "@/lib/url-state";
import { regionFormatOf, requireUser } from "@/lib/session";

export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const { loc, floor, person } = loadMapParams(await searchParams);
  const db = getDb();
  const [map, directory] = await Promise.all([
    loadMap(db, { loc, floor, person }, regionFormatOf(user)),
    loadDirectory(db, regionFormatOf(user)),
  ]);
  return <MapView map={map} people={directory.people} teams={directory.teams} />;
}
