import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import { parseIdentity, PROFILE_PROVIDER_IDS, type Identities } from "../people/identities";
import type { PersonRecord } from "../records";
import { regionCodeSchema } from "../regions/iso3166";
import { parseCsv, type CsvIssue, type CsvRecord } from "./parse";

export const PEOPLE_CSV_HEADERS = [
  "email",
  "name",
  "preferred_name",
  "title",
  "home_region",
  "home_timezone",
  "phone",
  "start_date",
  "active",
  "manager_email",
  "desk",
  "teams",
  "primary_team",
  // One column per profile provider in people/identities.ts. Keep the two lists in step.
  "github",
  "gitlab",
  "linkedin",
  "website",
] as const;

const REQUIRED = ["email", "name", "home_region"];

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
  name: z.string().min(1, "name is required"),
  preferred_name: z.string().transform(blankToNull),
  title: z.string().transform(blankToNull),
  home_region: regionCodeSchema("home_region"),
  home_timezone: z.string().transform(blankToNull),
  phone: z.string().transform(blankToNull),
  start_date: z
    .string()
    .pipe(z.union([z.literal(""), z.iso.date("start_date must be YYYY-MM-DD")]))
    .transform(blankToNull),
  active: boolish,
  manager_email: z.string().transform((v) => (v === "" ? null : v.toLowerCase())).pipe(z.email("manager_email is not a valid address").nullable()),
  desk: z.string().transform(blankToNull),
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
  // Identity providers whose column the file doesn't have. The import keeps the person's current
  // account for these instead of clearing it, so a spreadsheet from before the column existed
  // doesn't wipe accounts set in the app. A blank cell in a column that is there still clears.
  keepIdentities?: string[];
}

export interface PeopleCsvResult {
  rows: ValidPersonRow[];
  issues: CsvIssue[];
  fatal?: string;
}

export function parsePeopleCsv(text: string): PeopleCsvResult {
  const parsed = parseCsv(text, { columns: PEOPLE_CSV_HEADERS, required: REQUIRED, aliases: ALIASES });
  if (parsed.fatal) return { rows: [], issues: [], fatal: parsed.fatal };

  const absent = PROFILE_PROVIDER_IDS.filter((p) => !parsed.headers?.includes(p));
  const keep = absent.length > 0 ? { keepIdentities: absent } : {};
  const rows: ValidPersonRow[] = [];
  const issues: CsvIssue[] = [];
  for (const row of parsed.records) {
    const result = validatePersonRow(row);
    if (result.ok) rows.push({ line: row.line, record: result.record, ...keep });
    else issues.push({ line: row.line, message: result.message });
  }
  return { rows, issues };
}

export function validatePersonRow(
  row: CsvRecord,
): { ok: true; record: PersonRecord } | { ok: false; message: string } {
  const parsed = personCsvRowSchema.safeParse(row.values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "invalid row" };
  }
  const v = parsed.data;
  const teamSlugs = v.teams;
  const primary = v.primary_team;
  if (primary !== null && !teamSlugs.includes(primary)) {
    return { ok: false, message: `primary_team "${primary}" must also appear in teams` };
  }
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
      name: v.name,
      preferredName: v.preferred_name,
      title: v.title,
      phone: v.phone,
      homeRegion: v.home_region,
      homeTimezone: v.home_timezone,
      startDate: v.start_date,
      active: v.active,
      managerEmail: v.manager_email,
      deskCode: v.desk,
      teamSlugs,
      primaryTeamSlug: primary,
      identities,
    },
  };
}

export function peopleToCsv(people: PersonRecord[]): string {
  const data = people.map((p) => [
    p.email,
    p.name,
    p.preferredName ?? "",
    p.title ?? "",
    p.homeRegion,
    p.homeTimezone ?? "",
    p.phone ?? "",
    p.startDate ?? "",
    p.active ? "true" : "false",
    p.managerEmail ?? "",
    p.deskCode ?? "",
    [...p.teamSlugs].sort().join(";"),
    p.primaryTeamSlug ?? "",
    ...PROFILE_PROVIDER_IDS.map((provider) => p.identities[provider] ?? ""),
  ]);
  return stringify(data, { header: true, columns: [...PEOPLE_CSV_HEADERS] });
}
