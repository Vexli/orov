import { createId } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Enums mirror the data model in plan.md §5. Keep the TypeScript unions in
// packages/core in sync when adding values.

export const spaceKind = pgEnum("space_kind", [
  "desk",
  "meeting_room",
  "phone_booth",
  "kitchen",
  "elevator",
  "restroom",
  "other",
]);

export const presenceStatus = pgEnum("presence_status", [
  "sick",
  "vacation",
  "ooo",
  "wfh",
  "in_office",
  "unknown",
]);

// Vendor-neutral: which tool a signal came from is presence_signal.provider.
export const presenceSource = pgEnum("presence_source", [
  "message",
  "calendar_ooo",
  "calendar_working_location",
  "manual",
]);

export const presenceMatchType = pgEnum("presence_match_type", [
  "keyword",
  "regex",
]);

export const presenceDateScope = pgEnum("presence_date_scope", [
  "today",
  "tomorrow",
  "parse",
]);

// Whether a membership was chosen, or follows from one in a sub-team (#23).
export const membershipSource = pgEnum("membership_source", ["explicit", "inherited"]);

export const roomState = pgEnum("room_state", ["free", "busy", "soon"]);

export const appRole = pgEnum("app_role", ["viewer", "admin"]);

export const themeSourceFormat = pgEnum("theme_source_format", ["dtcg", "tokens_studio"]);

export const brandAssetKind = pgEnum("brand_asset_kind", [
  "logo_light",
  "logo_dark",
  "favicon",
  "font",
]);

// Mirrors REGION_DISPLAYS in packages/core/regions/iso3166.ts.
export const regionDisplay = pgEnum("region_display", [
  "code",
  "country",
  "region",
  "country_region",
  "flag",
]);

// Mirrors DATE_FORMATS in packages/core/dates/format.ts.
export const dateFormat = pgEnum("date_format", ["iso", "dmy", "mdy"]);

// A region column holds an ISO 3166-1 alpha-2 country ("US") or an ISO 3166-2 subdivision
// ("US-CA"). The database checks the shape; the app checks the code exists, because the
// subdivision list changes and a migration shouldn't be needed to follow it.
const regionShape = (column: AnyPgColumn) =>
  sql`${column} ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'`;

// Drizzle has no built-in bytea column. node-postgres reads bytea as a Buffer and writes one as is.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const id = (prefix: string) =>
  text("id")
    .primaryKey()
    .$defaultFn(() => `${prefix}_${createId()}`);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const location = pgTable(
  "location",
  {
    id: id("loc"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    region: text("region").notNull(),
    // The building's id in the room or calendar provider (Google buildingId, Microsoft Graph place).
    externalBuildingId: text("external_building_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    // What this office calls its floors, e.g. Building/Buildings on a campus (#16).
    floorLabelSingular: text("floor_label_singular").notNull().default("Floor"),
    floorLabelPlural: text("floor_label_plural").notNull().default("Floors"),
    // Archiving an office archives its floors too (#22).
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [check("location_region_iso3166", regionShape(t.region))],
);

export const svgAsset = pgTable(
  "svg_asset",
  {
    id: id("svg"),
    floorId: text("floor_id")
      .notNull()
      .references((): AnyPgColumn => floor.id),
    version: integer("version").notNull(),
    sanitizedSvg: text("sanitized_svg").notNull(),
    sha256: text("sha256").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("svg_asset_floor_version").on(t.floorId, t.version)],
);

export const floor = pgTable(
  "floor",
  {
    id: id("fl"),
    locationId: text("location_id")
      .notNull()
      .references(() => location.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    level: integer("level").notNull(),
    // Circular with svg_asset.floor_id. The app sets this after the first asset is inserted.
    svgAssetId: text("svg_asset_id").references((): AnyPgColumn => svgAsset.id),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("floor_location_slug").on(t.locationId, t.slug)],
);

export const area = pgTable(
  "area",
  {
    id: id("area"),
    floorId: text("floor_id")
      .notNull()
      .references(() => floor.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    svgElementId: text("svg_element_id").notNull(),
  },
  (t) => [
    uniqueIndex("area_floor_svg").on(t.floorId, t.svgElementId),
    uniqueIndex("area_floor_slug").on(t.floorId, t.slug),
  ],
);

export const space = pgTable(
  "space",
  {
    id: id("sp"),
    floorId: text("floor_id")
      .notNull()
      .references(() => floor.id),
    areaId: text("area_id").references(() => area.id),
    kind: spaceKind("kind").notNull(),
    svgElementId: text("svg_element_id").notNull(),
    // Human-readable code, for example "SF-2-014". Shown on cards and in CSV imports.
    name: text("name").notNull(),
    capacity: integer("capacity"),
    // The room's id in the calendar provider: a Google resource email, a Microsoft Graph room
    // address, or a booking tool's room id.
    calendarResourceId: text("calendar_resource_id").unique(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("space_floor_svg").on(t.floorId, t.svgElementId),
    // Desk codes are looked up by name in CSV imports, so they must be unique. Room names may repeat across floors.
    uniqueIndex("space_desk_name")
      .on(t.name)
      .where(sql`${t.kind} = 'desk'`),
  ],
);

export const person = pgTable(
  "person",
  {
    id: id("p"),
    email: text("email").notNull().unique(),
    givenName: text("given_name").notNull(),
    // Null for someone with a single name.
    familyName: text("family_name"),
    // The full name, kept in step by the database so every reader of `name` (search, the org
    // chart, the map) works unchanged. Write givenName and familyName instead.
    name: text("name")
      .notNull()
      .generatedAlwaysAs(
        sql`CASE WHEN family_name IS NULL OR family_name = '' THEN given_name ELSE given_name || ' ' || family_name END`,
      ),
    preferredName: text("preferred_name"),
    title: text("title"),
    photoUrl: text("photo_url"),
    phone: text("phone"),
    homeRegion: text("home_region").notNull(),
    homeTimezone: text("home_timezone"),
    managerId: text("manager_id").references((): AnyPgColumn => person.id),
    assignedDeskId: text("assigned_desk_id").references(() => space.id),
    // The office of someone without a desk (N9). Null with a desk, whose office it is.
    officeId: text("office_id").references(() => location.id),
    startDate: date("start_date"),
    // The last working day (N6). Admin-only.
    endDate: date("end_date"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // One person per desk. Partial, so people without a desk don't collide.
    uniqueIndex("person_assigned_desk")
      .on(t.assignedDeskId)
      .where(sql`${t.assignedDeskId} is not null`),
    index("person_manager").on(t.managerId),
    check("person_home_region_iso3166", regionShape(t.homeRegion)),
  ],
);

// Other accounts a person has, by provider id from packages/core/people/identities.ts: profile
// links (github, linkedin, …) and, later, messaging-tool ids. One account belongs to one person.
export const personIdentity = pgTable(
  "person_identity",
  {
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    value: text("value").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.provider] }),
    uniqueIndex("person_identity_provider_value").on(t.provider, t.value),
  ],
);

export const team = pgTable(
  "team",
  {
    id: id("t"),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    parentTeamId: text("parent_team_id").references((): AnyPgColumn => team.id),
    leadId: text("lead_id").references(() => person.id),
    // In the deployment's messaging provider (MESSAGING_PROVIDER), so no provider column.
    chatChannelId: text("chat_channel_id"),
    color: text("color"),
  },
  (t) => [index("team_parent").on(t.parentTeamId)],
);

export const teamMember = pgTable(
  "team_member",
  {
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => team.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(false),
    // A member of a sub-team is also an "inherited" member of every team above it. Those rows
    // are derived (syncInheritedMemberships) and never primary.
    source: membershipSource("source").notNull().default("explicit"),
  },
  (t) => [
    primaryKey({ columns: [t.personId, t.teamId] }),
    // At most one primary team per person.
    uniqueIndex("team_member_one_primary")
      .on(t.personId)
      .where(sql`${t.isPrimary} = true`),
  ],
);

export const presenceSignal = pgTable(
  "presence_signal",
  {
    id: id("sig"),
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: presenceStatus("status").notNull(),
    source: presenceSource("source").notNull(),
    // The tool the signal came from: "slack", "google", "microsoft", "manual", …
    provider: text("provider").notNull(),
    sourceRef: text("source_ref").notNull(),
    note: text("note"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    retractedAt: timestamp("retracted_at", { withTimezone: true }),
  },
  // Idempotent upserts: the same chat message or calendar event never produces two rows.
  (t) => [
    uniqueIndex("presence_signal_source").on(t.provider, t.source, t.sourceRef, t.date),
  ],
);

export const presenceDay = pgTable(
  "presence_day",
  {
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: presenceStatus("status").notNull(),
    winningSignalId: text("winning_signal_id").references(
      () => presenceSignal.id,
    ),
  },
  (t) => [primaryKey({ columns: [t.personId, t.date] })],
);

export const presenceRule = pgTable("presence_rule", {
  id: id("rule"),
  priority: integer("priority").notNull(),
  pattern: text("pattern").notNull(),
  matchType: presenceMatchType("match_type").notNull(),
  status: presenceStatus("status").notNull(),
  dateScope: presenceDateScope("date_scope").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const roomStatus = pgTable("room_status", {
  spaceId: text("space_id")
    .primaryKey()
    .references(() => space.id),
  state: roomState("state").notNull(),
  currentUntil: timestamp("current_until", { withTimezone: true }),
  nextStartsAt: timestamp("next_starts_at", { withTimezone: true }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
});

// A person's own token for a messaging provider, for actions taken as them (group DMs).
export const messagingUserToken = pgTable(
  "messaging_user_token",
  {
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.personId, t.provider] })],
);

export const appUser = pgTable("app_user", {
  email: text("email").primaryKey(),
  role: appRole("role").notNull().default("viewer"),
  // How this user sees region codes everywhere in the app. Their own setting, not an admin's.
  regionDisplay: regionDisplay("region_display")
    .notNull()
    .default("country_region"),
  // Whether region labels get the country's flag in front (#28).
  regionFlag: boolean("region_flag").notNull().default(false),
  // How this user sees dates and times (#27).
  dateFormat: dateFormat("date_format").notNull().default("iso"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "bigint" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    actorEmail: text("actor_email").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity").on(t.entity, t.entityId),
    index("audit_log_at").on(t.at),
  ],
);

export const integrationRun = pgTable("integration_run", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  job: text("job").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok").notNull(),
  stats: jsonb("stats"),
  error: text("error"),
});

// One row per applied theme version (plan.md §9.1). Exactly one is active, or none, in which case
// the deploy-time default is served. Rolling back switches the active row.
export const theme = pgTable(
  "theme",
  {
    id: id("theme"),
    version: integer("version").notNull().unique(),
    sourceFormat: themeSourceFormat("source_format").notNull(),
    // { files: [{ name, content }] }: the uploaded token files, parsed as JSON.
    sourceTokens: jsonb("source_tokens").notNull(),
    // { slots: SlotMapping, darkMode, fonts: brand_asset ids }. See packages/core/theme/map.ts.
    mapping: jsonb("mapping").notNull(),
    // The validated value of every slot by mode (ThemeValues). Kept so a request can read the
    // app name and logos, and an export can be written, without rebuilding the theme.
    values: jsonb("values").notNull(),
    compiledCss: text("compiled_css").notNull(),
    sha256: text("sha256").notNull(),
    active: boolean("active").notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("theme_one_active").on(t.active).where(sql`${t.active}`)],
);

// Logos, the favicon and fonts. Rows are never changed once written, so they can be cached
// forever by id, and a rolled-back theme still finds the files it used.
export const brandAsset = pgTable("brand_asset", {
  id: id("ba"),
  kind: brandAssetKind("kind").notNull(),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  sha256: text("sha256").notNull(),
  // Fonts: { family, weight, style }. Every kind: { fileName }.
  meta: jsonb("meta").notNull().default({}),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const locationRelations = relations(location, ({ many }) => ({
  floors: many(floor),
}));

export const floorRelations = relations(floor, ({ one, many }) => ({
  location: one(location, { fields: [floor.locationId], references: [location.id] }),
  spaces: many(space),
}));

export const spaceRelations = relations(space, ({ one }) => ({
  floor: one(floor, { fields: [space.floorId], references: [floor.id] }),
}));

export const personRelations = relations(person, ({ one, many }) => ({
  manager: one(person, {
    fields: [person.managerId],
    references: [person.id],
    relationName: "manager",
  }),
  reports: many(person, { relationName: "manager" }),
  assignedDesk: one(space, { fields: [person.assignedDeskId], references: [space.id] }),
  office: one(location, { fields: [person.officeId], references: [location.id] }),
  teamMembers: many(teamMember),
  identities: many(personIdentity),
}));

export const personIdentityRelations = relations(personIdentity, ({ one }) => ({
  person: one(person, { fields: [personIdentity.personId], references: [person.id] }),
}));

export const teamRelations = relations(team, ({ one, many }) => ({
  parent: one(team, {
    fields: [team.parentTeamId],
    references: [team.id],
    relationName: "parent",
  }),
  children: many(team, { relationName: "parent" }),
  lead: one(person, { fields: [team.leadId], references: [person.id] }),
  members: many(teamMember),
}));

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
  person: one(person, { fields: [teamMember.personId], references: [person.id] }),
  team: one(team, { fields: [teamMember.teamId], references: [team.id] }),
}));
