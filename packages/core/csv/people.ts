import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { parseIdentity, PROFILE_PROVIDER_IDS, type Identities } from "../people/identities";
import { splitFullName } from "../people/names";
import { normalizePhone } from "../people/phone";
import type { PersonRecord } from "../records";
import { regionCodeSchema } from "../regions/iso3166";
import { optionalTimeZoneSchema } from "../time/zones";
import { parseCsv, type CsvIssue, type CsvRecord } from "./parse";

export const PEOPLE_CSV_HEADERS = [
  "email",
  "given_name",
  "family_name",
  "preferred_name",
  "title",
  "home_region",
  "home_timezone",
  "phone",
  "start_date",
  "end_date",
  "active",
  "manager_email",
  "desk",
  "office",
  "teams",
  "primary_team",
  // One column per profile provider in people/identities.ts. Keep the two lists in step.
  "github",
  "gitlab",
  "linkedin",
  "website",
] as const;

// given_name is required too, unless the file has the older single `name` column instead.
const REQUIRED = ["email", "home_region"];
const LEGACY_NAME = "name";

export const LEGACY_NAME_NOTICE =
  "This file has a single name column. Each name is split at its last space into a given name " +
  "and a family name (Mary Ann Smith → Mary Ann / Smith); check the names below.";

// home_region was home_country when it held only two-letter country codes. Those still parse.
const ALIASES = { home_country: "home_region" };

const blankToNull = (value: string) => (value === "" ? null : value);

const boolish = z
  .string()
  .transform((v) => v.toLowerCase())
  .pipe(
    z.enum(["", "true", "false", "yes", "no", "1", "0"], {
      error: "active must be true or false (a blank cell means true)",
    }),
  )
  .transform((v) => v === "" || v === "true" || v === "yes" || v === "1");

// One row in the spreadsheet is the full state of one person. A blank cell clears the field.
export const personCsvRowSchema = z.object({
  email: z.string().transform((v) => v.toLowerCase()).pipe(z.email("email is not a valid address")),
  given_name: z.string(),
  family_name: z.string().transform(blankToNull),
  preferred_name: z.string().transform(blankToNull),
  title: z.string().transform(blankToNull),
  home_region: regionCodeSchema("home_region"),
  home_timezone: optionalTimeZoneSchema(
    "home_timezone is not an IANA time zone (for example America/Los_Angeles)",
  ),
  phone: z.string().transform(blankToNull),
  start_date: z
    .string()
    .pipe(z.union([z.literal(""), z.iso.date("start_date must be YYYY-MM-DD")]))
    .transform(blankToNull),
  end_date: z
    .string()
    .pipe(z.union([z.literal(""), z.iso.date("end_date must be YYYY-MM-DD")]))
    .transform(blankToNull),
  active: boolish,
  // One or more managers, separated by semicolons (N1).
  manager_email: z
    .string()
    .transform((v) => [...new Set(v.split(";").map((s) => s.trim().toLowerCase()).filter(Boolean))])
    .pipe(z.array(z.email("manager_email is not a valid address"))),
  desk: z.string().transform(blankToNull),
  office: z.string().transform((v) => (v === "" ? null : v.toLowerCase())),
  teams: z
    .string()
    .transform((v) =>
      [...new Set(v.split(";").map((s) => s.trim().toLowerCase()).filter(Boolean))],
    ),
  primary_team: z.string().transform((v) => (v === "" ? null : v.toLowerCase())),
});

export interface ValidPersonRow {
  line: number;
  record: PersonRecord;
  // Columns added after the spreadsheet format settled (KEPT_IF_ABSENT) that the file doesn't
  // have. The import keeps the person's current value for these instead of clearing it, so a
  // spreadsheet from before a column existed doesn't wipe what was set in the app. A blank cell
  // in a column that is there still clears it.
  absentColumns?: string[];
}

// The account columns (#12), end_date (N6) and office (N9).
export const KEPT_IF_ABSENT = [...PROFILE_PROVIDER_IDS, "end_date", "office"];

export interface PeopleCsvResult {
  rows: ValidPersonRow[];
  issues: CsvIssue[];
  // Things the admin should know before applying, such as names split from a legacy column.
  notices: string[];
  fatal?: string;
}

export function parsePeopleCsv(text: string): PeopleCsvResult {
  const parsed = parseCsv(text, {
    columns: [...PEOPLE_CSV_HEADERS, LEGACY_NAME],
    required: REQUIRED,
    aliases: ALIASES,
  });
  if (parsed.fatal) return { rows: [], issues: [], notices: [], fatal: parsed.fatal };
  const headers = parsed.headers ?? [];
  const legacyName = !headers.includes("given_name") && headers.includes(LEGACY_NAME);
  if (!headers.includes("given_name") && !legacyName) {
    return { rows: [], issues: [], notices: [], fatal: "Missing required column(s): given_name" };
  }

  const absent = KEPT_IF_ABSENT.filter((column) => !headers.includes(column));
  const keep = absent.length > 0 ? { absentColumns: absent } : {};
  const rows: ValidPersonRow[] = [];
  const issues: CsvIssue[] = [];
  for (const row of parsed.records) {
    const result = validatePersonRow(row, legacyName);
    if (result.ok) rows.push({ line: row.line, record: result.record, ...keep });
    else issues.push({ line: row.line, message: result.message });
  }
  return { rows, issues, notices: legacyName ? [LEGACY_NAME_NOTICE] : [] };
}

// `legacyName`: the file has a single `name` column, split into given and family name.
export function validatePersonRow(
  row: CsvRecord,
  legacyName = false,
): { ok: true; record: PersonRecord } | { ok: false; message: string } {
  const parsed = personCsvRowSchema.safeParse(row.values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "invalid row" };
  }
  const v = parsed.data;
  const name = legacyName
    ? splitFullName(row.values[LEGACY_NAME] ?? "")
    : { givenName: v.given_name, familyName: v.family_name };
  if (name.givenName === "") return { ok: false, message: legacyName ? "name is required" : "given_name is required" };
  const teamSlugs = v.teams;
  const primary = v.primary_team;
  if (v.start_date !== null && v.end_date !== null && v.end_date < v.start_date) {
    return { ok: false, message: "end_date can't be before start_date" };
  }
  if (primary !== null && !teamSlugs.includes(primary)) {
    return { ok: false, message: `primary_team "${primary}" must also appear in teams` };
  }
  const phone = normalizePhone(v.phone, v.home_region);
  if (!phone.ok) return { ok: false, message: `phone: ${phone.message}` };
  const identities: Identities = {};
  for (const provider of PROFILE_PROVIDER_IDS) {
    const result = parseIdentity(provider, row.values[provider]);
    if (!result.ok) return { ok: false, message: `${provider}: ${result.message}` };
    if (result.value !== null) identities[provider] = result.value;
  }
  return {
    ok: true,
    record: {
      email: v.email,
      givenName: name.givenName,
      familyName: name.familyName,
      preferredName: v.preferred_name,
      title: v.title,
      phone: phone.value,
      homeRegion: v.home_region,
      homeTimezone: v.home_timezone,
      startDate: v.start_date,
      endDate: v.end_date,
      active: v.active,
      managerEmails: v.manager_email,
      deskCode: v.desk,
      officeSlug: v.office,
      teamSlugs,
      primaryTeamSlug: primary,
      identities,
    },
  };
}

export function peopleToCsv(people: PersonRecord[]): string {
  const data = people.map((p) => [
    p.email,
    p.givenName,
    p.familyName ?? "",
    p.preferredName ?? "",
    p.title ?? "",
    p.homeRegion,
    p.homeTimezone ?? "",
    p.phone ?? "",
    p.startDate ?? "",
    p.endDate ?? "",
    p.active ? "true" : "false",
    p.managerEmails.join(";"),
    p.deskCode ?? "",
    p.officeSlug ?? "",
    [...p.teamSlugs].sort().join(";"),
    p.primaryTeamSlug ?? "",
    ...PROFILE_PROVIDER_IDS.map((provider) => p.identities[provider] ?? ""),
  ]);
  return stringify(data, { header: true, columns: [...PEOPLE_CSV_HEADERS] });
}
