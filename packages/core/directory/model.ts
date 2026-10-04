import type { Identities } from "../people/identities";

// Shapes the directory works with. They're plain data, so the same filter runs on the server,
// in tests, and in the browser.

export interface DirectoryTeam {
  id: string;
  name: string;
  slug: string;
  parentTeamId: string | null;
}

export interface DirectoryPerson {
  id: string;
  name: string;
  preferredName: string | null;
  email: string;
  title: string | null;
  // ISO 3166 code ("US" or "US-CA").
  homeRegion: string;
  // homeRegion formatted with the viewer's region display preference, on the server, so the
  // browser never needs the subdivision list.
  homeRegionLabel: string;
  homeTimezone: string | null;
  manager: { id: string; name: string } | null;
  desk: {
    id: string;
    name: string;
    floorName: string;
    locationName: string;
    locationSlug: string;
    locationRegion: string;
  } | null;
  teams: { id: string; name: string; slug: string; isPrimary: boolean }[];
  // Profile accounts by provider id. Links are built with identityLinks, never from the value.
  identities: Identities;
}
