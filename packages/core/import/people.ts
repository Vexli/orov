import type { PersonRecord } from "../records";
import { diffRecords, PERSON_FIELDS } from "../records";
import { reachesAncestor } from "../teams/tree";
import type { CsvIssue } from "../csv/parse";
import type { ValidPersonRow } from "../csv/people";
import { summarize, type ImportPlan, type PlannedRow } from "./plan";

// What the database currently holds, in the same vocabulary as the CSV.
export interface PeopleSnapshot {
  people: Map<string, PersonRecord>;
  teamSlugs: Set<string>;
  desks: Map<string, DeskInfo>;
}

export interface DeskInfo {
  // False when the space isn't a desk, or its floor or space is archived.
  assignable: boolean;
  ownerEmail: string | null;
}

export function planPeopleImport(
  rows: ValidPersonRow[],
  parseIssues: CsvIssue[],
  snapshot: PeopleSnapshot,
): ImportPlan<PersonRecord> {
  const planned: PlannedRow<PersonRecord>[] = [];
  const errors = new Map<string, string>(); // email -> message, for rows that will not be applied
  const desired = new Map<string, ValidPersonRow>();

  for (const issue of parseIssues) {
    planned.push({ line: issue.line, key: `line ${issue.line}`, action: "error", changes: [], message: issue.message });
  }

  for (const row of rows) {
    const email = row.record.email;
    const prior = desired.get(email);
    if (prior) {
      planned.push({
        line: row.line,
        key: email,
        action: "error",
        changes: [],
        message: `email also appears on line ${prior.line}`,
      });
      continue;
    }
    desired.set(email, row);
  }

  // Final manager of each person after this import. Anyone not in the file keeps their current manager.
  const finalManager = (email: string): string | null => {
    const row = desired.get(email);
    if (row) return row.record.managerEmail;
    return snapshot.people.get(email)?.managerEmail ?? null;
  };

  // Desk claims after this import: rows in the file win, everyone else keeps their desk.
  const deskClaims = new Map<string, string[]>();
  for (const [email, row] of desired) {
    if (row.record.deskCode) pushTo(deskClaims, row.record.deskCode, email);
  }
  for (const [email, person] of snapshot.people) {
    if (!desired.has(email) && person.deskCode) pushTo(deskClaims, person.deskCode, email);
  }

  for (const [email, row] of desired) {
    const rec = row.record;
    const problem = validateReferences(row, snapshot, desired, finalManager, deskClaims);
    if (problem) errors.set(email, problem);
    if (errors.has(email)) {
      planned.push({ line: row.line, key: email, action: "error", changes: [], message: errors.get(email), record: rec });
      continue;
    }

    const existing = snapshot.people.get(email);
    if (!existing) {
      const changes = diffRecords(emptyPerson(email), rec, PERSON_FIELDS);
      planned.push({ line: row.line, key: email, action: "create", changes, record: rec });
      continue;
    }
    const changes = diffRecords(existing, rec, PERSON_FIELDS);
    planned.push({
      line: row.line,
      key: email,
      action: changes.length === 0 ? "unchanged" : "update",
      changes,
      record: rec,
    });
  }

  return summarize(planned);
}

function validateReferences(
  row: ValidPersonRow,
  snapshot: PeopleSnapshot,
  desired: Map<string, ValidPersonRow>,
  finalManager: (email: string) => string | null,
  deskClaims: Map<string, string[]>,
): string | null {
  const rec = row.record;

  for (const slug of rec.teamSlugs) {
    if (!snapshot.teamSlugs.has(slug)) return `unknown team "${slug}" (import teams first)`;
  }

  if (rec.managerEmail !== null) {
    if (rec.managerEmail === rec.email) return "manager_email cannot be the person themself";
    if (!desired.has(rec.managerEmail) && !snapshot.people.has(rec.managerEmail)) {
      return `manager ${rec.managerEmail} is not in the file or the database`;
    }
    if (reachesAncestor(finalManager, rec.managerEmail, rec.email)) {
      return `manager chain loops back to ${rec.email}`;
    }
  }

  if (rec.deskCode !== null) {
    const desk = snapshot.desks.get(rec.deskCode);
    if (!desk) return `unknown desk "${rec.deskCode}"`;
    if (!desk.assignable) return `desk "${rec.deskCode}" is not a desk, or its floor is archived`;
    const claimants = (deskClaims.get(rec.deskCode) ?? []).filter((e) => e !== rec.email);
    if (claimants.length > 0) return `desk "${rec.deskCode}" is also assigned to ${claimants[0]}`;
  }

  return null;
}

function emptyPerson(email: string): PersonRecord {
  return {
    email,
    name: "",
    preferredName: null,
    title: null,
    phone: null,
    homeCountry: "",
    homeTimezone: null,
    startDate: null,
    active: true,
    managerEmail: null,
    deskCode: null,
    teamSlugs: [],
    primaryTeamSlug: null,
  };
}

function pushTo(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
