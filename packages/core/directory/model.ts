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
  // The country's flag, when the viewer turned flags on (#28). Shown hidden from screen readers.
  homeRegionFlag: string | null;
  // The viewer chose flags alone (N7): show the flag, with the label for screen readers only.
  homeRegionFlagOnly: boolean;
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
  // Every membership. `inherited` ones follow from a membership of a sub-team (#23); the views
  // match on the explicit ones (explicitTeams), so a team means the same with or without them.
  teams: { id: string; name: string; slug: string; isPrimary: boolean; inherited: boolean }[];
  // Profile accounts by provider id. Links are built with identityLinks, never from the value.
  identities: Identities;
}
