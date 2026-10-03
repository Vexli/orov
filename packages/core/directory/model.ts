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
  homeCountry: string;
  homeTimezone: string | null;
  manager: { id: string; name: string } | null;
  desk: {
    id: string;
    name: string;
    floorName: string;
    locationName: string;
    locationSlug: string;
    locationCountry: string;
  } | null;
  teams: { id: string; name: string; slug: string; isPrimary: boolean }[];
}
