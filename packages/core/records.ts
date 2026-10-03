// Flat, spreadsheet-shaped views of people and teams. References are by email and slug,
// never by database id, so a CSV row and a database row compare directly.

export interface PersonRecord {
  email: string;
  name: string;
  preferredName: string | null;
  title: string | null;
  phone: string | null;
  homeCountry: string;
  homeTimezone: string | null;
  startDate: string | null;
  active: boolean;
  managerEmail: string | null;
  deskCode: string | null;
  teamSlugs: string[];
  primaryTeamSlug: string | null;
}

export interface TeamRecord {
  slug: string;
  name: string;
  parentSlug: string | null;
  slackChannelId: string | null;
  color: string | null;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

// Compares two records field by field. Arrays are compared by value, so team order doesn't matter.
export function diffRecords<T extends object>(
  before: T,
  after: T,
  fields: readonly (keyof T & string)[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const a = normalize(before[field]);
    const b = normalize(after[field]);
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changes.push({ field, before: before[field] ?? null, after: after[field] ?? null });
    }
  }
  return changes;
}

function normalize(value: unknown): unknown {
  return Array.isArray(value) ? [...value].sort() : (value ?? null);
}

export const PERSON_FIELDS = [
  "name",
  "preferredName",
  "title",
  "phone",
  "homeCountry",
  "homeTimezone",
  "startDate",
  "active",
  "managerEmail",
  "deskCode",
  "teamSlugs",
  "primaryTeamSlug",
] as const satisfies readonly (keyof PersonRecord)[];

export const TEAM_FIELDS = [
  "name",
  "parentSlug",
  "slackChannelId",
  "color",
] as const satisfies readonly (keyof TeamRecord)[];
