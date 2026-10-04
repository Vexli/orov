import { asc, eq } from "drizzle-orm";
import {
  compareByFamilyName,
  DEFAULT_REGION_FORMAT,
  displayPhone,
  regionLabel,
  type DirectoryPerson,
  type DirectoryTeam,
  type RegionFormat,
} from "@officeorg/core";
import type { Executor } from "../client";
import * as s from "../schema";
import { profileIdentities } from "./people";

export interface DirectoryData {
  people: DirectoryPerson[];
  teams: DirectoryTeam[];
  locations: { slug: string; name: string }[];
}

// Everything the directory needs in one read. Inactive people are left out. The directory is
// for finding colleagues, and the admin pages still show everyone. Region labels are formatted
// here, in the viewer's preferred style, so the browser never loads the ISO 3166-2 list.
export async function loadDirectory(
  db: Executor,
  regionFormat: RegionFormat = DEFAULT_REGION_FORMAT,
): Promise<DirectoryData> {
  const rows = await db.query.person.findMany({
    where: eq(s.person.active, true),
    with: {
      manager: { columns: { id: true, name: true } },
      assignedDesk: {
        with: { floor: { with: { location: true } } },
      },
      teamMembers: { with: { team: { columns: { id: true, name: true, slug: true } } } },
      identities: { columns: { provider: true, value: true } },
    },
  });
  // By family name, then given name, with the same collation the browser would use.
  rows.sort(compareByFamilyName);

  const teams = await db.query.team.findMany({
    columns: { id: true, name: true, slug: true, parentTeamId: true },
    orderBy: (t, { asc }) => [asc(t.name)],
  });

  const locations = await db
    .select({ slug: s.location.slug, name: s.location.name })
    .from(s.location)
    .orderBy(asc(s.location.sortOrder), asc(s.location.name));

  const people: DirectoryPerson[] = rows.map((row) => {
    const region = regionLabel(row.homeRegion, regionFormat);
    return {
      id: row.id,
      name: row.name,
      givenName: row.givenName,
      familyName: row.familyName,
      preferredName: row.preferredName,
      email: row.email,
      title: row.title,
      homeRegion: row.homeRegion,
      homeRegionLabel: region.label,
      homeRegionFlag: region.flag,
      homeTimezone: row.homeTimezone,
      phone: row.phone ? displayPhone(row.phone) : null,
      manager: row.manager ? { id: row.manager.id, name: row.manager.name } : null,
      desk: row.assignedDesk
        ? {
            id: row.assignedDesk.id,
            name: row.assignedDesk.name,
            floorName: row.assignedDesk.floor.name,
            locationName: row.assignedDesk.floor.location.name,
            locationSlug: row.assignedDesk.floor.location.slug,
            locationRegion: row.assignedDesk.floor.location.region,
          }
        : null,
      teams: row.teamMembers
        .map((m) => ({
          id: m.team.id,
          name: m.team.name,
          slug: m.team.slug,
          isPrimary: m.isPrimary,
          inherited: m.source === "inherited",
        }))
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name)),
      identities: profileIdentities(row.identities),
    };
  });

  return { people, teams, locations };
}
