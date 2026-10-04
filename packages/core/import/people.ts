import type { PersonRecord } from "../records";
import { diffPersonRecords } from "../records";
import { inheritedManager, reachesAncestor, type TeamLeadInfo } from "../teams/tree";
import { defaultTimeZone } from "../time/zones";
import type { CsvIssue } from "../csv/parse";
import type { ValidPersonRow } from "../csv/people";
import { summarize, type ImportPlan, type PlannedRow } from "./plan";

// What the database currently holds, in the same vocabulary as the CSV.
export interface PeopleSnapshot {
  people: Map<string, PersonRecord>;
  teamSlugs: Set<string>;
  // By slug, with parents as slugs and leads as emails, for the default manager (#11).
  teams: Map<string, TeamLeadInfo>;
  desks: Map<string, DeskInfo>;
}

export interface DeskInfo {
  // False when the space isn't a desk, or its floor or space is archived.
  assignable: boolean;
  ownerEmail: string | null;
  // The desk's office's time zone, the default for a blank home_timezone.
  timezone: string;
}

// `skip` holds the line numbers the admin left out. They're removed before anything else is
// checked, so the other rows are validated against the world without them: a row whose manager
// or parent is on a skipped line becomes an error rather than being written half-broken.
export function planPeopleImport(
  rows: ValidPersonRow[],
  parseIssues: CsvIssue[],
  snapshot: PeopleSnapshot,
  skip: ReadonlySet<number> = new Set(),
): ImportPlan<PersonRecord> {
  const planned: PlannedRow<PersonRecord>[] = [];
  const errors = new Map<string, string>(); // email -> message, for rows that will not be applied
  const desired = new Map<string, ValidPersonRow>();
  const skippedLine = new Map<string, number>(); // email -> line, for messages about dependencies

  for (const issue of parseIssues) {
    const action = skip.has(issue.line) ? "skipped" : "error";
    planned.push({ line: issue.line, key: `line ${issue.line}`, action, changes: [], message: issue.message });
  }

  for (const original of rows) {
    if (skip.has(original.line)) {
      planned.push({ line: original.line, key: original.record.email, action: "skipped", changes: [] });
      if (!skippedLine.has(original.record.email)) skippedLine.set(original.record.email, original.line);
      continue;
    }
    const row = withDeskTimeZone(withKeptIdentities(original, snapshot), snapshot);
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

  // A blank manager_email means the default: the primary team's lead (#11). A default that would
  // close a reporting loop is dropped rather than reported, since the admin didn't ask for it.
  const inherited = new Set<string>();
  for (const [email, row] of desired) {
    const { managerEmail, primaryTeamSlug } = row.record;
    if (managerEmail !== null || primaryTeamSlug === null) continue;
    const lead = inheritedManager(email, primaryTeamSlug, snapshot.teams);
    if (lead === null || (!desired.has(lead) && !snapshot.people.has(lead))) continue;
    desired.set(email, { ...row, record: { ...row.record, managerEmail: lead } });
    inherited.add(email);
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

  for (const email of inherited) {
    const row = desired.get(email)!;
    if (reachesAncestor(finalManager, row.record.managerEmail, email)) {
      desired.set(email, { ...row, record: { ...row.record, managerEmail: null } });
    }
  }

  // Accounts after this import, keyed "provider value", claimed the same way as desks.
  const identityClaims = new Map<string, string[]>();
  for (const [email, row] of desired) {
    for (const [provider, value] of Object.entries(row.record.identities)) {
      pushTo(identityClaims, identityKey(provider, value), email);
    }
  }
  for (const [email, person] of snapshot.people) {
    if (desired.has(email)) continue;
    for (const [provider, value] of Object.entries(person.identities)) {
      pushTo(identityClaims, identityKey(provider, value), email);
    }
  }

  for (const [email, row] of desired) {
    const rec = row.record;
    const problem = validateReferences(row, snapshot, desired, finalManager, deskClaims, identityClaims, skippedLine);
    if (problem) errors.set(email, problem);
    if (errors.has(email)) {
      planned.push({ line: row.line, key: email, action: "error", changes: [], message: errors.get(email), record: rec });
      continue;
    }

    const existing = snapshot.people.get(email);
    if (!existing) {
      const changes = diffPersonRecords(emptyPerson(email), rec);
      planned.push({ line: row.line, key: email, action: "create", changes, record: rec });
      continue;
    }
    const changes = diffPersonRecords(existing, rec);
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
  identityClaims: Map<string, string[]>,
  skippedLine: Map<string, number>,
): string | null {
  const rec = row.record;

  for (const slug of rec.teamSlugs) {
    if (!snapshot.teamSlugs.has(slug)) return `unknown team "${slug}" (import teams first)`;
  }

  if (rec.managerEmail !== null) {
    if (rec.managerEmail === rec.email) return "manager_email cannot be the person themself";
    if (!desired.has(rec.managerEmail) && !snapshot.people.has(rec.managerEmail)) {
      const line = skippedLine.get(rec.managerEmail);
      return line !== undefined
        ? `manager ${rec.managerEmail} is on line ${line}, which is skipped`
        : `manager ${rec.managerEmail} is not in the file or the database`;
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
    if (claimants.length > 0) {
      const line = skippedLine.get(claimants[0]!);
      // The holder's move off this desk was on a skipped line, so they keep it.
      return line !== undefined
        ? `desk "${rec.deskCode}" is still assigned to ${claimants[0]}, whose line ${line} is skipped`
        : `desk "${rec.deskCode}" is also assigned to ${claimants[0]}`;
    }
  }

  for (const [provider, value] of Object.entries(rec.identities)) {
    const others = (identityClaims.get(identityKey(provider, value)) ?? []).filter((e) => e !== rec.email);
    if (others.length > 0) return `${provider} "${value}" also belongs to ${others[0]}`;
  }

  return null;
}

function emptyPerson(email: string): PersonRecord {
  return {
    email,
    givenName: "",
    familyName: null,
    preferredName: null,
    title: null,
    phone: null,
    homeRegion: "",
    homeTimezone: null,
    startDate: null,
    active: true,
    managerEmail: null,
    deskCode: null,
    teamSlugs: [],
    primaryTeamSlug: null,
    identities: {},
  };
}

// A blank home time zone takes the desk's office's, so the dry run shows what will be stored.
function withDeskTimeZone(row: ValidPersonRow, snapshot: PeopleSnapshot): ValidPersonRow {
  const { homeTimezone, deskCode } = row.record;
  if (homeTimezone !== null || deskCode === null) return row;
  const zone = defaultTimeZone(null, snapshot.desks.get(deskCode)?.timezone);
  return zone ? { ...row, record: { ...row.record, homeTimezone: zone } } : row;
}

// Fills in the person's current accounts for the identity columns the file doesn't have.
function withKeptIdentities(row: ValidPersonRow, snapshot: PeopleSnapshot): ValidPersonRow {
  const current = snapshot.people.get(row.record.email)?.identities;
  if (!row.keepIdentities || !current) return row;
  const identities = { ...row.record.identities };
  for (const provider of row.keepIdentities) {
    if (current[provider]) identities[provider] = current[provider];
  }
  return { ...row, record: { ...row.record, identities } };
}

function identityKey(provider: string, value: string) {
  return `${provider} ${value}`;
}

function pushTo(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
