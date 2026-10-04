import type { Identities } from "./people/identities";

// Flat, spreadsheet-shaped views of people and teams. References are by email and slug,
// never by database id, so a CSV row and a database row compare directly.

export interface PersonRecord {
  email: string;
  name: string;
  preferredName: string | null;
  title: string | null;
  phone: string | null;
  homeRegion: string;
  homeTimezone: string | null;
  startDate: string | null;
  active: boolean;
  managerEmail: string | null;
  deskCode: string | null;
  teamSlugs: string[];
  primaryTeamSlug: string | null;
  // Profile accounts only (github, linkedin, …), by provider id. Messaging ids are not
  // spreadsheet data: a match job writes them.
  identities: Identities;
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
  "homeRegion",
  "homeTimezone",
  "startDate",
  "active",
  "managerEmail",
  "deskCode",
  "teamSlugs",
  "primaryTeamSlug",
] as const satisfies readonly (keyof PersonRecord)[];

// PERSON_FIELDS plus one change per identity provider, named by the provider id.
export function diffPersonRecords(before: PersonRecord, after: PersonRecord): FieldChange[] {
  const changes = diffRecords(before, after, PERSON_FIELDS);
  const providers = [
    ...new Set([...Object.keys(before.identities), ...Object.keys(after.identities)]),
  ].sort();
  for (const provider of providers) {
    const a = before.identities[provider] ?? null;
    const b = after.identities[provider] ?? null;
    if (a !== b) changes.push({ field: provider, before: a, after: b });
  }
  return changes;
}

export const TEAM_FIELDS = [
  "name",
  "parentSlug",
  "slackChannelId",
  "color",
] as const satisfies readonly (keyof TeamRecord)[];
