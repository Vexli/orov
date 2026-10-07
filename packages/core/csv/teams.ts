import { stringify } from "csv-stringify/sync";
import { z } from "zod";
import type { TeamRecord } from "../records";
import { SAFE_CSV_CAST } from "./formula";
import { parseCsv, type CsvIssue, type CsvRecord } from "./parse";

export const TEAMS_CSV_HEADERS = ["slug", "name", "parent_slug", "chat_channel_id", "color"];

// Legacy header: files written before chat providers became configurable (migration 0005) still import.
const ALIASES = { slack_channel_id: "chat_channel_id" };

const blankToNull = (value: string) => (value === "" ? null : value);

export const teamCsvRowSchema = z.object({
  slug: z
    .string()
    .transform((v) => v.toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "slug may contain only a-z, 0-9 and hyphens")),
  name: z.string().min(1, "name is required"),
  parent_slug: z.string().transform((v) => (v === "" ? null : v.toLowerCase())),
  chat_channel_id: z.string().transform(blankToNull),
  color: z.string().transform(blankToNull),
});

export interface ValidTeamRow {
  line: number;
  record: TeamRecord;
}

export interface TeamsCsvResult {
  rows: ValidTeamRow[];
  issues: CsvIssue[];
  fatal?: string;
}

export function parseTeamsCsv(text: string): TeamsCsvResult {
  const parsed = parseCsv(text, {
    columns: TEAMS_CSV_HEADERS,
    required: ["slug", "name"],
    aliases: ALIASES,
  });
  if (parsed.fatal) return { rows: [], issues: [], fatal: parsed.fatal };

  const rows: ValidTeamRow[] = [];
  const issues: CsvIssue[] = [];
  for (const row of parsed.records) {
    const result = validateTeamRow(row);
    if (result.ok) rows.push({ line: row.line, record: result.record });
    else issues.push({ line: row.line, message: result.message });
  }
  return { rows, issues };
}

export function validateTeamRow(
  row: CsvRecord,
): { ok: true; record: TeamRecord } | { ok: false; message: string } {
  const parsed = teamCsvRowSchema.safeParse(row.values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "invalid row" };
  }
  const v = parsed.data;
  return {
    ok: true,
    record: {
      slug: v.slug,
      name: v.name,
      parentSlug: v.parent_slug,
      chatChannelId: v.chat_channel_id,
      color: v.color,
    },
  };
}

export function teamsToCsv(teams: TeamRecord[]): string {
  const data = teams.map((t) => [
    t.slug,
    t.name,
    t.parentSlug ?? "",
    t.chatChannelId ?? "",
    t.color ?? "",
  ]);
  return stringify(data, { header: true, columns: TEAMS_CSV_HEADERS, cast: SAFE_CSV_CAST });
}
