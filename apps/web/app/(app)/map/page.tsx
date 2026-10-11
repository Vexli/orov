import type { SearchParams } from "nuqs/server";
import { GettingStarted } from "@/components/getting-started";
import { MapView } from "@/components/map/map-view";
import { getDb } from "@orov/db/client";
import { loadDirectory } from "@orov/db/queries/directory";
import { loadMap } from "@orov/db/queries/map";
import { loadMapParams } from "@/lib/url-state";
import { regionFormatOf, requireUser } from "@/lib/session";
import { getCurrentTheme } from "@/lib/theme";
import { emitLocationThemeCss } from "@orov/core/theme/location-override";

export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const { loc, floor, person } = loadMapParams(await searchParams);
  const db = getDb();
  const [map, directory, theme] = await Promise.all([
    loadMap(db, { loc, floor, person }, regionFormatOf(user)),
    loadDirectory(db, regionFormatOf(user)),
    getCurrentTheme(),
  ]);
  // No office at all: a new instance. (Offices without a drawing get MapView's own note.)
  if (map.locations.length === 0) {
    return <GettingStarted title="Map" isAdmin={user.role === "admin"} />;
  }
  const shown = map.floor;
  const locationThemeCss = shown
    ? emitLocationThemeCss(shown.locationId, theme.values, shown.locationTheme)
    : "";
  return (
    <MapView
      map={map}
      people={directory.people}
      teams={directory.teams}
      locationThemeCss={locationThemeCss}
    />
  );
}
