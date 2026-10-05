import type { TeamRecord } from "../records";
import { diffRecords, TEAM_FIELDS } from "../records";
import { reachesAncestor } from "../teams/tree";
import type { CsvIssue } from "../csv/parse";
import type { ValidTeamRow } from "../csv/teams";
import { summarize, type ImportPlan, type PlannedRow } from "./plan";

// `skip` holds line numbers the admin left out, as in planPeopleImport.
export function planTeamsImport(
  rows: ValidTeamRow[],
  parseIssues: CsvIssue[],
  existing: Map<string, TeamRecord>,
  skip: ReadonlySet<number> = new Set(),
): ImportPlan<TeamRecord> {
  const planned: PlannedRow<TeamRecord>[] = [];
  const desired = new Map<string, ValidTeamRow>();
  const errors = new Map<string, string>();
  const skippedLine = new Map<string, number>();

  for (const issue of parseIssues) {
    const action = skip.has(issue.line) ? "skipped" : "error";
    planned.push({ line: issue.line, key: `line ${issue.line}`, action, changes: [], message: issue.message });
  }

  for (const row of rows) {
    if (skip.has(row.line)) {
      planned.push({ line: row.line, key: row.record.slug, action: "skipped", changes: [] });
      if (!skippedLine.has(row.record.slug)) skippedLine.set(row.record.slug, row.line);
      continue;
    }
    const prior = desired.get(row.record.slug);
    if (prior) {
      planned.push({
        line: row.line,
        key: row.record.slug,
        action: "error",
        changes: [],
        message: `slug also appears on line ${prior.line}`,
      });
      continue;
    }
    desired.set(row.record.slug, row);
  }

  const finalParent = (slug: string): string | null => {
    const row = desired.get(slug);
    if (row) return row.record.parentSlug;
    return existing.get(slug)?.parentSlug ?? null;
  };

  for (const [slug, row] of desired) {
    const rec = row.record;
    if (rec.parentSlug !== null) {
      if (rec.parentSlug === slug) errors.set(slug, "parent_slug cannot be the team itself");
      else if (!desired.has(rec.parentSlug) && !existing.has(rec.parentSlug)) {
        const line = skippedLine.get(rec.parentSlug);
        errors.set(
          slug,
          line !== undefined
            ? `parent team "${rec.parentSlug}" is on line ${line}, which is skipped`
            : `parent team "${rec.parentSlug}" is not in the file or the database`,
        );
      } else if (reachesAncestor(finalParent, rec.parentSlug, slug)) {
        errors.set(slug, `parent chain loops back to ${slug}`);
      }
    }

    if (errors.has(slug)) {
      planned.push({ line: row.line, key: slug, action: "error", changes: [], message: errors.get(slug), record: rec });
      continue;
    }

    const before = existing.get(slug);
    if (!before) {
      planned.push({
        line: row.line,
        key: slug,
        action: "create",
        changes: diffRecords(emptyTeam(slug), rec, TEAM_FIELDS),
        record: rec,
      });
      continue;
    }
    const changes = diffRecords(before, rec, TEAM_FIELDS);
    planned.push({
      line: row.line,
      key: slug,
      action: changes.length === 0 ? "unchanged" : "update",
      changes,
      record: rec,
    });
  }

  return summarize(planned);
}

function emptyTeam(slug: string): TeamRecord {
  return { slug, name: "", parentSlug: null, chatChannelId: null, color: null };
}
