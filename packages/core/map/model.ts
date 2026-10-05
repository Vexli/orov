import type { LocationTheme } from "../theme/location-override";
import type { SpaceKind } from "../svg/parse";
import type { TierLabels } from "../spaces/tier";
import type { RoomDisplayState } from "./room-status";

// Shapes the floor map works with. Plain data, so the server loads them once and the browser
// derives every highlight from them without another request.

export interface MapFloorLink {
  slug: string;
  name: string;
  level: number;
  hasDrawing: boolean;
  // For the office overview. Archived spaces aren't counted.
  deskCount: number;
  // Meeting rooms and phone booths.
  roomCount: number;
}

export interface MapLocation {
  slug: string;
  name: string;
  // The office's region in the viewer's display style (plan.md §7.1).
  regionLabel: string;
  regionFlag: string | null;
  regionFlagOnly: boolean;
  // What this office calls its floors (#16).
  floorLabels: TierLabels;
  floors: MapFloorLink[];
}

export interface MapArea {
  id: string;
  slug: string;
  name: string;
  svgElementId: string;
}

export interface MapSpace {
  id: string;
  svgElementId: string;
  kind: SpaceKind;
  name: string;
  capacity: number | null;
  areaId: string | null;
  // Meeting rooms and phone booths with a calendar status; null otherwise.
  status: RoomDisplayState | null;
}

// Where one person sits. Loaded for every floor, so the map can follow a person to another
// floor and count a team's seats per floor without asking the server again.
export interface MapSeat {
  personId: string;
  spaceId: string;
  svgElementId: string;
  deskName: string;
  floorSlug: string;
  floorName: string;
  locationSlug: string;
  locationName: string;
  areaSlug: string | null;
}

export interface MapFloor {
  id: string;
  slug: string;
  name: string;
  locationId: string;
  locationSlug: string;
  locationName: string;
  // The office's own map colors (Phase 6), or null for the organization's theme.
  locationTheme: LocationTheme | null;
  // Changes whenever the drawing does, so the browser can cache measurements per version.
  assetId: string;
  svg: string;
  areas: MapArea[];
  spaces: MapSpace[];
}

export interface MapData {
  locations: MapLocation[];
  // Null when no floor has a drawing yet.
  floor: MapFloor | null;
  seats: MapSeat[];
}
