import type { Identities } from "../people/identities";
import type { PhoneDisplay } from "../people/phone";

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
  // The full name, "given family".
  name: string;
  givenName: string;
  familyName: string | null;
  preferredName: string | null;
  email: string;
  title: string | null;
  // ISO 3166 code ("US" or "US-CA").
  homeRegion: string;
  // homeRegion formatted with the viewer's region display preference, on the server, so the
  // browser never needs the subdivision list.
  homeRegionLabel: string;
  homeTimezone: string | null;
  // Formatted on the server, like homeRegionLabel, so the browser never loads the phone metadata.
  phone: PhoneDisplay | null;
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
