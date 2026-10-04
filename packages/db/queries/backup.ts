import { getTableColumns, sql, type Column } from "drizzle-orm";
import type { IndexColumn, PgTable } from "drizzle-orm/pg-core";
import type { Database, Executor } from "../client";
import * as s from "../schema";
import { recordAudit } from "./audit";
import { ValidationError } from "./errors";
import { syncInheritedMemberships } from "./memberships";
import { hasManagerCycle } from "./people";
import { hasTeamCycle } from "./teams";

// The organization as one document (#29): offices, floors with every drawing version, areas,
// spaces, teams, people with their memberships and accounts, users and their settings, themes
// and brand files. Ids are kept, so links and references survive a move between instances.
// Never included: messaging tokens, presence data (health-adjacent, with its own retention), room
// status (a cache), integration runs and the audit log (export that with /api/export/audit).
// Encryption is the caller's job (core/backup/crypto.ts).

// In foreign-key order, so a section only refers to sections before it, apart from the
// self-references cleared on insert and set afterwards (DEFERRED).
const SECTIONS = {
  locations: s.location,
  floors: s.floor,
  svgAssets: s.svgAsset,
  areas: s.area,
  spaces: s.space,
  teams: s.team,
  people: s.person,
  teamMembers: s.teamMember,
  personIdentities: s.personIdentity,
  appUsers: s.appUser,
  brandAssets: s.brandAsset,
  themes: s.theme,
} as const satisfies Record<string, PgTable>;

export type SectionName = keyof typeof SECTIONS;
export const SECTION_NAMES = Object.keys(SECTIONS) as SectionName[];

type Row = Record<string, unknown>;

export interface OrganizationExport {
  meta: {
    exportedAt: string;
    exportedBy: string;
    // The last migration applied to the database it came from (drizzle's created_at).
    schemaVersion: number;
    counts: Record<SectionName, number>;
  };
  data: Record<SectionName, Row[]>;
}

// Columns pointing back into the same or a later section: written as null, then filled in.
const DEFERRED: Partial<Record<SectionName, string[]>> = {
  floors: ["svgAssetId"],
  teams: ["parentTeamId", "leadId"],
  people: ["managerId"],
};

// How a row is identified, for comparing a file with the database.
const KEY: Record<SectionName, string[]> = {
  locations: ["id"],
  floors: ["id"],
  svgAssets: ["id"],
  areas: ["id"],
  spaces: ["id"],
  teams: ["id"],
  people: ["id"],
  teamMembers: ["personId", "teamId"],
  personIdentities: ["personId", "provider"],
  appUsers: ["email"],
  brandAssets: ["id"],
  themes: ["id"],
};

// Values that must stay unique, checked in merge mode (a different row already using them is a
// conflict). The desk code is unique among desks only.
const UNIQUE: Partial<Record<SectionName, { label: string; value: (r: Row) => string | null }[]>> =
  {
    locations: [{ label: "office slug", value: (r) => String(r.slug) }],
    teams: [{ label: "team slug", value: (r) => String(r.slug) }],
    people: [{ label: "email", value: (r) => String(r.email) }],
    spaces: [{ label: "desk code", value: (r) => (r.kind === "desk" ? String(r.name) : null) }],
    personIdentities: [{ label: "account", value: (r) => `${r.provider} ${r.value}` }],
  };

const keyOf = (section: SectionName, row: Row) => KEY[section].map((k) => String(row[k])).join("|");

function columnsOf(table: PgTable): [string, Column][] {
  return Object.entries(getTableColumns(table));
}

// Drizzle rows → plain JSON: dates as ISO strings, bytes as base64.
function toJson(table: PgTable, row: Row): Row {
  const out: Row = {};
  for (const [name, column] of columnsOf(table)) {
    const value = row[name];
    if (column.generated) continue;
    out[name] =
      value instanceof Date
        ? value.toISOString()
        : Buffer.isBuffer(value)
          ? value.toString("base64")
          : value;
  }
  return out;
}

// And back, for the columns the table has; anything else in the file is ignored.
function fromJson(table: PgTable, row: Row): Row {
  const out: Row = {};
  for (const [name, column] of columnsOf(table)) {
    if (column.generated || !(name in row)) continue;
    const value = row[name];
    if (value === null || value === undefined) out[name] = null;
    else if (column.columnType === "PgTimestamp") out[name] = new Date(String(value));
    else if (column.getSQLType() === "bytea") out[name] = Buffer.from(String(value), "base64");
    else out[name] = value;
  }
  return out;
}

export async function currentSchemaVersion(db: Executor): Promise<number> {
  const result = await db.execute(
    sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`,
  );
  return Number((result.rows[0] as { created_at: string } | undefined)?.created_at ?? 0);
}

export async function exportOrganization(
  db: Executor,
  exportedBy: string,
): Promise<OrganizationExport> {
  const data = {} as Record<SectionName, Row[]>;
  for (const name of SECTION_NAMES) {
    const table = SECTIONS[name];
    const rows = (await db.select().from(table)) as Row[];
    data[name] = rows
      .map((row) => toJson(table, row))
      .sort((a, b) => keyOf(name, a).localeCompare(keyOf(name, b)));
  }
  const counts = Object.fromEntries(SECTION_NAMES.map((n) => [n, data[n].length])) as Record<
    SectionName,
    number
  >;
  return {
    meta: {
      exportedAt: new Date().toISOString(),
      exportedBy,
      schemaVersion: await currentSchemaVersion(db),
      counts,
    },
    data,
  };
}

// The export, recorded in the audit log (without the data).
export async function exportOrganizationAudited(
  db: Database,
  actorEmail: string,
): Promise<OrganizationExport> {
  return db.transaction(async (tx) => {
    const exported = await exportOrganization(tx, actorEmail);
    await recordAudit(tx, actorEmail, {
      entity: "organization",
      entityId: "export",
      action: "export",
      after: { counts: exported.meta.counts, schemaVersion: exported.meta.schemaVersion },
    });
    return exported;
  });
}

// "replace" empties the instance and loads the file: for restoring a backup or setting up a new
// instance. "merge" adds and updates rows by id and leaves the rest alone.
export type ImportMode = "replace" | "merge";

export interface SectionPlan {
  create: number;
  update: number;
  unchanged: number;
  // Only in merge mode, and there only for this section.
  conflicts: string[];
}

export interface ImportPlanResult {
  sections: Record<SectionName, SectionPlan>;
  // Rows in the database that a replace would remove (counted per section).
  removed: Record<SectionName, number>;
  canApply: boolean;
}

function parseExport(json: string): OrganizationExport {
  let parsed: OrganizationExport;
  try {
    parsed = JSON.parse(json) as OrganizationExport;
  } catch {
    throw new ValidationError("The decrypted file isn't valid JSON.");
  }
  if (!parsed?.meta || typeof parsed.meta.schemaVersion !== "number" || !parsed.data) {
    throw new ValidationError("The file doesn't contain an organization export.");
  }
  for (const name of SECTION_NAMES) {
    const rows = parsed.data[name];
    if (rows !== undefined && !Array.isArray(rows))
      throw new ValidationError(`The ${name} section is malformed.`);
    parsed.data[name] = (rows ?? []).filter((r): r is Row => typeof r === "object" && r !== null);
  }
  return parsed;
}

async function checkVersion(db: Executor, file: OrganizationExport) {
  const ours = await currentSchemaVersion(db);
  if (file.meta.schemaVersion > ours) {
    throw new ValidationError(
      "This file comes from a newer version of the app. Upgrade this instance first.",
    );
  }
  if (file.meta.schemaVersion < ours) {
    // Version 1 of the format has no upgrade steps yet; the first change to it will add them.
    throw new ValidationError(
      "This file comes from an older version of the app, which this one can't read yet. Export it again from an up-to-date instance.",
    );
  }
}

async function loadExisting(db: Executor): Promise<Record<SectionName, Row[]>> {
  return (await exportOrganization(db, "")).data;
}

const same = (a: Row, b: Row) =>
  JSON.stringify(a, Object.keys(a).sort()) === JSON.stringify(b, Object.keys(b).sort());

export async function planImport(
  db: Executor,
  json: string,
  mode: ImportMode,
): Promise<ImportPlanResult> {
  const file = parseExport(json);
  await checkVersion(db, file);
  const existing = await loadExisting(db);
  const sections = {} as Record<SectionName, SectionPlan>;
  const removed = {} as Record<SectionName, number>;
  for (const name of SECTION_NAMES) {
    const table = SECTIONS[name];
    const current = new Map(existing[name].map((r) => [keyOf(name, r), r]));
    const plan: SectionPlan = { create: 0, update: 0, unchanged: 0, conflicts: [] };
    const incomingKeys = new Set<string>();
    for (const raw of file.data[name]) {
      const row = toJson(table, fromJson(table, raw));
      const key = keyOf(name, row);
      incomingKeys.add(key);
      const before = current.get(key);
      if (!before || mode === "replace") plan.create += 1;
      else if (same(before, row)) plan.unchanged += 1;
      else plan.update += 1;
    }
    if (mode === "merge") {
      for (const unique of UNIQUE[name] ?? []) {
        const holders = new Map<string, string>();
        for (const r of existing[name]) {
          const v = unique.value(r);
          if (v !== null) holders.set(v, keyOf(name, r));
        }
        for (const raw of file.data[name]) {
          const v = unique.value(raw);
          const holder = v === null ? undefined : holders.get(v);
          if (holder !== undefined && holder !== keyOf(name, raw)) {
            plan.conflicts.push(
              `${unique.label} "${v}" is already used by another ${name === "people" ? "person" : "row"} here`,
            );
          }
        }
      }
    }
    removed[name] = mode === "replace" ? existing[name].length : 0;
    sections[name] = plan;
  }
  const canApply = SECTION_NAMES.every((n) => sections[n].conflicts.length === 0);
  return { sections, removed, canApply };
}

export interface ApplyImportOptions {
  mode: ImportMode;
  // Take roles from the file. Without it, new users are viewers and existing users keep theirs.
  // The importing admin stays an admin either way, so they can't lock themselves out.
  applyRoles: boolean;
}

export async function applyImport(
  db: Database,
  actorEmail: string,
  json: string,
  options: ApplyImportOptions,
): Promise<ImportPlanResult> {
  return db.transaction(async (tx) => {
    const plan = await planImport(tx, json, options.mode);
    if (!plan.canApply)
      throw new ValidationError(
        "The file conflicts with this instance's data; nothing was imported.",
      );
    const file = parseExport(json);
    const roles = new Map(
      (
        (await tx.select({ email: s.appUser.email, role: s.appUser.role }).from(s.appUser)) as Row[]
      ).map((r) => [String(r.email), r.role]),
    );

    if (options.mode === "replace") await emptyOrganization(tx);

    // Pass 1: every row, with the deferred self-references cleared.
    for (const name of SECTION_NAMES) {
      const table = SECTIONS[name];
      const deferred = DEFERRED[name] ?? [];
      if (name === "themes" && file.data.themes.some((t) => t.active)) {
        // One active theme at a time (a partial unique index); the file's wins.
        await tx.update(s.theme).set({ active: false });
      }
      for (const raw of file.data[name]) {
        const row = fromJson(table, raw);
        for (const column of deferred) row[column] = null;
        if (name === "appUsers" && !options.applyRoles)
          row.role = roles.get(String(row.email)) ?? "viewer";
        const columns = getTableColumns(table) as Record<string, Column>;
        const target = KEY[name].map((k) => columns[k]! as IndexColumn);
        const set = Object.fromEntries(Object.entries(row).filter(([k]) => !KEY[name].includes(k)));
        const insert = tx.insert(table).values(row);
        await (Object.keys(set).length > 0
          ? insert.onConflictDoUpdate({ target, set })
          : insert.onConflictDoNothing({ target }));
      }
    }

    // Pass 2: the self-references.
    for (const [name, columns] of Object.entries(DEFERRED) as [SectionName, string[]][]) {
      const table = SECTIONS[name] as PgTable;
      const id = (getTableColumns(table) as Record<string, Column>).id!;
      for (const raw of file.data[name]) {
        const values = Object.fromEntries(columns.map((c) => [c, raw[c] ?? null]));
        if (Object.values(values).every((v) => v === null)) continue;
        await tx
          .update(table)
          .set(values)
          .where(sql`${id} = ${raw.id}`);
      }
    }

    // The checks every other write makes.
    for (const person of file.data.people) {
      if (await hasManagerCycle(tx, String(person.id))) {
        throw new ValidationError(
          `The file's managers loop back to ${person.email}; nothing was imported.`,
        );
      }
    }
    for (const team of file.data.teams) {
      if (await hasTeamCycle(tx, String(team.id))) {
        throw new ValidationError(
          `The file's teams loop back to ${team.slug}; nothing was imported.`,
        );
      }
    }
    await syncInheritedMemberships(tx);
    await tx
      .insert(s.appUser)
      .values({ email: actorEmail, role: "admin" })
      .onConflictDoUpdate({ target: s.appUser.email, set: { role: "admin" } });

    await recordAudit(tx, actorEmail, {
      entity: "organization",
      entityId: "import",
      action: "import",
      after: {
        mode: options.mode,
        applyRoles: options.applyRoles,
        sections: plan.sections,
        from: file.meta.exportedBy,
      },
    });
    return plan;
  });
}

// Everything the export covers, plus the rows that point at it (room status, presence, tokens).
// The audit log stays: it records this import too.
async function emptyOrganization(tx: Executor) {
  await tx.execute(sql`UPDATE floor SET svg_asset_id = NULL`);
  await tx.execute(sql`UPDATE team SET lead_id = NULL, parent_team_id = NULL`);
  await tx.execute(sql`UPDATE person SET manager_id = NULL, assigned_desk_id = NULL`);
  for (const table of [
    "room_status",
    "presence_day",
    "presence_signal",
    "messaging_user_token",
    "person_identity",
    "team_member",
    "theme",
    "brand_asset",
    "app_user",
    "person",
    "team",
    "space",
    "area",
    "svg_asset",
    "floor",
    "location",
  ]) {
    await tx.execute(sql.raw(`DELETE FROM ${table}`));
  }
}
