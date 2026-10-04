# OfficeOrg: Implementation Plan

This plan turns the build-from-scratch option in `report.md` into concrete work. OfficeOrg is an internal web app with four parts: a floor map, a people directory, an org chart, and optional live presence (off by default, §8.5). It also shows Google Calendar room status and has Slack chat shortcuts. It covers 1–3 offices and fewer than 250 people.

Where this plan departs from `report.md`, it says so. One change in particular: **WFH and sick status come from keyword messages in a public Slack channel** (the requirement in the report's Context section), not from Slack profile status emoji (the design in the report's Integrations section).

---

## 1. Goals, non-goals, user stories

### Goals

- The tool is the **source of truth** for people, teams, reporting lines, and seat assignments. Those currently live in spreadsheets.
- It provides one linked view: person ↔ seat ↔ team ↔ manager ↔ presence ↔ Slack.
- All integrations are read-only, except the group-DM creation the viewer starts.
- The app can be restyled to an organization's brand guidelines (colors, fonts, logo, sizing, spacing, density) **without code changes**, by importing design tokens exported from Figma, Penpot, or Tokens Studio (§9.1).

### Non-goals (v1)

- Room or desk **booking**, hot-desking, kiosks, or room panels. Buy Robin, Skedda, or a similar product if these are needed later.
- HRIS sync. The design should leave room for it, but v1 doesn't build it.
- Native mobile apps. A responsive web app is enough.

### User stories (these double as the acceptance tests)

| #   | Story                                                                                                     | View      |
| --- | --------------------------------------------------------------------------------------------------------- | --------- |
| U1  | Find **Bob** and see his seat highlighted on the right floor                                              | dir → map |
| U2  | Select **HR** and see the seats of every member of HR and its sub-teams, with a count per floor           | map       |
| U3  | See that **Bob reports to Max, and Max reports to Jane**                                                  | org       |
| U4  | See that **Jane is based in Ontario, Canada (`CA-ON`) and also has a desk** in SF                         | dir, map  |
| U5  | See which meeting rooms are busy (red) or free (green) right now                                          | map       |
| U6  | Open the **South Wing** as a zoomed area view of its floor                                                | map       |
| U7  | Chat with one person, start a group DM with 2–8 people, or open a team's channel                          | all       |
| U8  | When an admin has turned presence display on: in **simple** mode, see who isn't in today because they're greyed out. In **detailed** mode, see who is on vacation, sick, or WFH, with a badge on their desk and a pill in the directory. With display **off** (the default), no presence appears anywhere | all       |
| U9  | Switch between directory, map, and org chart without losing the selected person or team                   | all       |
| U10 | An admin imports the existing spreadsheets, then edits people, teams, and seats in the app                | admin     |
| U11 | An admin uploads a new floor SVG and sees a diff of added, removed, and orphaned seats before applying it | admin     |
| U12 | An admin imports the brand's design tokens, maps them, previews them, and applies them. The directory, map, and org chart pick up the new colors, fonts, logo, and density | admin |
| U13 | In their own settings, a user chooses how locations appear: the **ISO 3166 code** (`US-CA`), the **country name** (United States), the **region name** (California), or the **region and country name** (California, United States). Other users are unaffected | settings, all |

---

## 2. Phase 0: integration spikes (2–3 days, before anything else)

These are throwaway scripts in `spikes/`. Each spike checks an assumption that later phases depend on. If a spike fails, rework the matching phase before building it.

| Spike                 | Steps                                                                                                                                                                                               | Pass criteria                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **freeBusy**          | Create a service account with domain-wide delegation (DWD). Call `resources.calendars.list` while impersonating an admin. Call `freebusy.query` for 2–3 room resource emails.                       | Busy blocks match the Calendar UI. Building, floor, and section fields are populated.                                        |
| **Calendar presence** | Impersonate 3–5 volunteers and call `events.list` with `eventTypes=outOfOffice` and `eventTypes=workingLocation`.                                                                                   | OOO events are returned. `workingLocationProperties.type` distinguishes home from office.                                    |
| **Slack channel**     | Create a bot with `channels:history` and add it to the status channel. Pull 60 days of `conversations.history`.                                                                                     | You end up with a list of real phrasings to seed the keyword rule table, and a rough share of messages that are unambiguous. |
| **Slack chat**        | Using a test **user** token, call `conversations.open users=U1,U2` and open `slack://channel?team=T&id=<returned id>`. Separately, run `users.lookupByEmail` for everyone on the staff spreadsheet. | The group DM opens in the desktop client. More than 95% of emails match.                                                     |
| **Design tokens** | Export real token files from Figma (via Tokens Studio or the Variables export available on the org's plan) and from Penpot's design tokens panel. Run each through Style Dictionary or a draft parser. | Aliases and light/dark modes resolve to concrete values. The exported field names and quirks are recorded, so the parser fixtures match reality. |

Write down the outcomes, especially the real Slack phrasings, in `docs/spikes.md`.

---

## 3. Architecture

```
┌──────────────────────────── one repo (pnpm workspace) ───────────────────────────┐
│                                                                                    │
│  apps/web  (Next.js App Router)            apps/worker  (Node, long-running)       │
│  ─ UI: /directory /map /org /admin         ─ pg-boss scheduled jobs:               │
│  ─ Route handlers: /api/*                    · rooms:freebusy      every 60s       │
│  ─ Server actions for admin writes           · presence:calendar   every 60 min    │
│  ─ Auth.js (pluggable SSO, domain-restricted) · presence:slack-backfill  every 15 min│
│  ─ Reads cached integration data only        · slack:match-users   nightly         │
│                                             ─ Slack Bolt in Socket Mode:            │
│                                               message events from #status channel   │
│                        \                        /                                  │
│                         └── packages/db (Drizzle schema + queries) ──┐             │
│                             packages/core (pure domain logic)         │             │
│                             packages/integrations (Google/Slack adapters + fakes)   │
└───────────────────────────────────────────────────────────────────────┼────────────┘
                                                                        ▼
                                                                   Postgres 16
```

### Key decisions

| Decision        | Choice                                                                                       | Why                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js (App Router) + TypeScript, strict mode                                               | Required stack.                                                                                                                                                                     |
| DB / ORM        | Postgres 16 + **Drizzle** (with drizzle-kit migrations)                                      | SQL-shaped queries suit recursive CTEs (team trees, org chains), and the schema stays in TypeScript.                                                                                |
| Background work | A separate **worker process**, scheduled with **pg-boss**                                    | Next.js has no reliable in-process scheduler. pg-boss stores its queue in Postgres, so you don't need Redis. Slack Socket Mode needs a persistent connection anyway.                |
| Slack events    | **Socket Mode** (Bolt) in the worker                                                         | You don't need a public webhook URL, so the web app can sit behind a VPN or IAP. If hosting later makes a public URL easy, switch to the Events API (an HTTP route in the web app). |
| Auth            | **Auth.js** with the SSO providers listed in `AUTH_PROVIDERS`: `google`, `microsoft-entra-id`, `okta`, `cognito`, or any `oidc` issuer. Reject sign-in unless the email is on `COMPANY_DOMAIN`; Google also needs `hd === COMPANY_DOMAIN` and `email_verified`, and Entra needs a tenant-specific issuer. Local development can add a shared-password login (`AUTH_DEV_PASSWORD`) and an automatic sign-in (`AUTH_DEV_BYPASS_EMAIL`); both are ignored unless running `next dev` on a localhost `AUTH_URL`. | Single sign-on with whichever identity provider the organization already uses. Roles live in the DB (`viewer` by default, `admin` bootstrapped from the `ADMIN_EMAILS` env var). |
| URL state       | **nuqs** (type-safe search params)                                                           | The selection lives in the URL (§7), and nuqs gives typed parsers and shallow updates.                                                                                              |
| Map             | Inline sanitized SVG + **react-zoom-pan-pinch**                                              | Zooming to an area is a `zoomToElement` call. No canvas or WebGL is needed at this scale.                                                                                           |
| Org chart       | **d3-org-chart** (MIT), wrapped in a client component                                        | Expand/collapse, `setCentered`, and `setHighlighted` cover U3 and U9 out of the box. Fall back to React Flow + elkjs only if heavy customization is needed.                         |
| UI kit          | Tailwind v4 + shadcn/ui, **styled only through semantic CSS variables**; TanStack Table for the directory | Fast, accessible, no design system to build. Components never use raw palette classes (`bg-white`, `text-neutral-900`), so a brand theme can restyle everything (§9.1). |
| Theming         | **W3C DTCG design tokens** → mapped onto a fixed set of semantic slots → CSS custom properties served at `/theme.css` | DTCG is the vendor-neutral format that Figma (through plugins or export), Penpot, and Tokens Studio all produce. Runtime CSS variables mean a brand change needs no rebuild, and shadcn/ui already uses the same variable model. |
| Validation      | **zod** at every boundary (CSV rows, API input, integration payloads)                        | Bad spreadsheet data is the main risk in the first two weeks.                                                                                                                       |
| Tests           | Vitest (core + db against a real Postgres via testcontainers), Playwright (end-to-end)       | See §11.                                                                                                                                                                            |

### Integration adapter rule

Everything external goes behind an interface in `packages/integrations`. For example:

```ts
interface RoomCalendar {
	listRooms(): Promise<RoomResource[]>;
	freeBusy(
		emails: string[],
		from: Date,
		to: Date,
	): Promise<Map<string, BusyBlock[]>>;
}
```

Each interface has a real Google or Slack implementation and a `Fake*` implementation that seeded tests and local development use. `INTEGRATIONS=fake` in `.env.local` runs the whole app offline.

---

## 4. Repository layout

```
apps/
  web/
    app/
      (app)/layout.tsx            -- shell: top bar, view tabs, search, selection tray
      (app)/directory/page.tsx
      (app)/map/page.tsx
      (app)/org/page.tsx
      (app)/settings/{page,actions}.ts(x)  -- per-user settings (§7.1)
      admin/{people,teams,locations,floors,rooms,presence-rules,import,integrations,branding,audit}/
      api/{rooms/status,presence,search,slack/oauth/*,slack/group-dm,brand-assets/[id]}/route.ts
      theme.css/route.ts          -- active theme as a cached stylesheet (§9.1)
    components/{map,org,directory,selection,admin}/
    lib/{auth.ts,url-state.ts,permissions.ts}
  worker/
    src/{index.ts,jobs/*.ts,slack/socket.ts}
packages/
  db/        schema.ts, migrations/, queries/{people,teams,spaces,presence}.ts, seed.ts
  core/      presence/{rules.ts,resolve.ts}, svg/{parse.ts,sanitize.ts,diff.ts},
             teams/tree.ts, csv/{people.ts,teams.ts}, slack/links.ts,
             regions/iso3166.ts,
             theme/{slots.ts,parse.ts,resolve.ts,map.ts,validate.ts,contrast.ts,emit-css.ts}
  integrations/ google/{rooms.ts,calendar.ts}, slack/{users.ts,history.ts}, fakes/
theme/ default.tokens.json         -- deploy-time default theme (DTCG)
spikes/
docs/ spikes.md, map-authoring.md, runbook.md, theming.md
e2e/  Playwright specs per user story
```

---

## 5. Data model

The schema builds on the model in `report.md` and adds cache, audit, and integration tables. All ids are text (`p_…`, `t_…`; use `cuid2`) so they're safe to put in URLs. Integration columns are vendor-neutral (Phase 7 #4–6): no column, enum value or CSV header names Slack or Google, so a Microsoft 365, Teams or room-booking adapter needs no schema change.

```
location      (id, slug UNIQUE, name, timezone, region (ISO 3166 code), externalBuildingId?,
               sortOrder, floorLabelSingular, floorLabelPlural,   -- default Floor/Floors (#16)
               archivedAt?)                                       -- archives its floors too (#22)
floor         (id, locationId, slug, name, level int, svgAssetId, sortOrder)
                UNIQUE(locationId, slug)
svg_asset     (id, floorId, version int, sanitizedSvg text, sha256, uploadedBy, uploadedAt)
area          (id, floorId, slug, name, svgElementId)          UNIQUE(floorId, svgElementId)
space         (id, floorId, areaId?, kind, svgElementId, name, capacity?,
               calendarResourceId? UNIQUE, archivedAt?)
                kind: desk | meeting_room | phone_booth | kitchen | elevator | restroom | other
                UNIQUE(floorId, svgElementId)

person        (id, email UNIQUE, givenName, familyName?, name (generated: "given family"),
               preferredName?, title?, photoUrl?, phone? (E.164),
               homeRegion (ISO 3166 code), homeTimezone?,
               managerId → person?, assignedDeskId → space? UNIQUE (partial, non-null),
               officeId → location? (only without a desk, N9),
               startDate?, endDate? (last day, admin-only, N6), active bool, createdAt, updatedAt)
team          (id, slug UNIQUE, name, parentTeamId → team?, leadId → person?,
               chatChannelId?, color?)
team_member   (personId, teamId, isPrimary bool, source: explicit | inherited)
                PK(personId, teamId), partial UNIQUE(personId) WHERE isPrimary
                inherited: derived from an explicit membership of a sub-team (Phase 7 #23)
person_identity (personId → person ON DELETE CASCADE, provider, value)
                PK(personId, provider), UNIQUE(provider, value)
                provider: github | gitlab | linkedin | website (profile, admin-edited)
                          | messaging ids from #4 (written by the match job)

presence_signal (id, personId, date, status, source, provider, sourceRef, note?, observedAt,
                 retractedAt?)
                 source: message | calendar_ooo | calendar_working_location | manual
                 provider: slack | google | microsoft | manual | …
                 UNIQUE(provider, source, sourceRef, date)   -- idempotent upserts
presence_day    (personId, date, status, winningSignalId?, PK(personId, date))  -- derived
presence_rule   (id, priority int, pattern text, matchType: keyword|regex,
                 status, dateScope: today|tomorrow|parse, enabled)

room_status     (spaceId PK, state: free|busy|soon, currentUntil?, nextStartsAt?,
                 checkedAt)

app_setting     (key PK, value jsonb, updatedBy, updatedAt)
                 key presence.display: off | simple | detailed   -- default off (§8.5)

messaging_user_token (personId, provider, encryptedToken, scopes, createdAt)   -- for group DMs
                 PK(personId, provider)
app_user        (email PK, role: viewer|admin,
                 regionDisplay: code|country|region|country_region   -- default country_region
                 lastSeenAt)
audit_log       (id, actorEmail, entity, entityId, action, before jsonb, after jsonb, at)
integration_run (id, job, startedAt, finishedAt?, ok bool, stats jsonb, error?)

theme         (id, version int UNIQUE, sourceFormat: dtcg|tokens_studio, sourceTokens jsonb,
               mapping jsonb, values jsonb, compiledCss text, sha256, active bool, createdBy,
               createdAt)                              -- values: validated slot values by mode
                partial UNIQUE(active) WHERE active   -- rollback = switch the active row
brand_asset   (id, kind: logo_light|logo_dark|favicon|font, mime, bytes bytea, sha256,
               meta jsonb, createdAt)                  -- meta: font family/weight/style
```

### Invariants, enforced in code and covered by tests

- **No cycles** in `person.managerId` or `team.parentTeamId`. Check with a recursive CTE inside the same transaction as the write, and reject the write if it would create a cycle.
- **One person per desk** (partial unique index). Reassigning a desk is a single transaction that swaps the two people.
- **The desk must be `kind = desk`**, and its floor must not be archived.
- `homeRegion` and `assignedDeskId` are **independent** (U4). The UI shows "Ontario, Canada [SF-2-003]", with the seat code as a badge, in the viewer's region format (§7.1).
- **Region codes** (`person.homeRegion`, `location.region`) are one ISO 3166 code each: a country (ISO 3166-1 alpha-2, `US`) or a subdivision (ISO 3166-2, `US-CA`). The country is never stored separately, because a subdivision code starts with it. A CHECK constraint enforces the shape (`^[A-Z]{2}(-[A-Z0-9]{1,3})?$`). The app checks that the code exists in ISO 3166 (the `iso-3166` package) at every input boundary (CSV, admin forms). The database doesn't check existence, so a change to the subdivision list never needs a migration.
- Seats are referenced by `space.id`, and **never** by SVG array position. `svgElementId` only connects a space to its drawing.

### Common queries (in `packages/db/queries`)

- `teamWithDescendants(teamId)`: a recursive CTE on `team.parentTeamId`, joined to `team_member` (U2).
- `managementChain(personId)` and `reportsTree(rootId)`: recursive CTEs on `managerId` (U3).
- `seatsForPeople(personIds)`: returns each seat grouped by floor, with counts (U2).

---

## 6. Floor maps

### Authoring convention (`docs/map-authoring.md`)

Each floor is one SVG file, drawn in Figma or Illustrator. Layer and element ids follow these rules:

| Prefix             | Meaning                              | Example           |
| ------------------ | ------------------------------------ | ----------------- |
| `area-<slug>`      | A zoomable region (a `<g>` or shape) | `area-south-wing` |
| `desk-<floor>-<n>` | A desk                               | `desk-2-014`      |
| `room-<slug>`      | A meeting room or phone booth        | `room-boardroom`  |
| `poi-<kind>[-<n>]` | Kitchen, elevator, restroom          | `poi-kitchen`     |

Anything without one of these prefixes is decoration.

### Upload pipeline (`packages/core/svg`)

1. **Sanitize.** Run the file through DOMPurify with the SVG profile (in jsdom on the server). Strip `<script>`, `on*` handlers, `<foreignObject>`, and external `href`s. Then run svgo with `cleanupIds` **disabled**, because svgo would otherwise rename the ids the app depends on. Inline SVG is an XSS vector, so this step is not optional.
2. **Parse.** Collect the ids that match the prefixes. Each desk or room is assigned to the area whose element contains it in the DOM tree. If the designer didn't nest it, fall back to whichever area's bounding box contains the element's center.
3. **Diff** against the current `space`/`area` rows for that floor. The result lists **added**, **unchanged**, **removed but unassigned** (archive automatically), and **removed but assigned** (block until the admin reassigns the person or confirms they become deskless).
4. **Apply** in one transaction. The new version becomes a new `svg_asset` row, so you can roll back by switching the floor's `svgAssetId` back.

### Rendering (`components/map`)

- Inject the sanitized SVG **once** with `dangerouslySetInnerHTML`, and don't re-render it. To show state, generate a `<style>` block from the current state with rules keyed by id, for example `#desk-2-014 { fill: var(--sel) }`, `#room-boardroom { fill: var(--busy) }`, and `.dim :not(.hl) { opacity: .25 }`. Changing state then re-renders only a short string of CSS, not hundreds of SVG nodes.
- The state `<style>` block uses **only theme slot variables** (`var(--map-selection)`, `var(--room-busy)`, `var(--map-dim-opacity)`), never literal colors, so a brand theme restyles the map without touching the SVG (§9.1). Room status also gets a non-color cue (a pattern fill or icon in the overlay), so it never depends on hue alone.
- An **overlay layer** draws the names of rooms and points of interest from the database (Phase 7 #26; drawings carry no name labels; areas are not labelled, N8), avatars and, when presence display is on, the presence state from §8.5: badges in `detailed` mode, a greyed avatar and desk in `simple` mode, nothing in `off` mode. It's an absolutely positioned `<svg>` with the same viewBox, placed using `getBBox()` of each desk element, measured once after mount and cached per asset version.
- Clicking an element triggers event delegation on the root: read `target.closest('[id^=desk-],[id^=room-]')`, then update the URL.
- **Area view (U6):** with `area=south-wing` in the URL, call `zoomToElement('area-south-wing')` and add the `dim` class to everything outside that area.
- **Floor switcher** for the location's floors. The location overview page lists floors with headcount and free-room counts.
- **Accessibility:** offer a "List" toggle on the map that renders the same seats and rooms as a table, because an SVG map can't be navigated with a keyboard in any useful way.

---

## 7. Views and the selection model

### URL schema (the only selection state)

```
/{directory|map|org}?loc=sf&floor=2&area=south-wing&person=p_123&team=t_9&sub=false&multi=p_1,p_2
```

| Param                  | Effect                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `person`               | The focused person. Every view centers on them.                                                                              |
| `team`                 | The highlighted team, with its descendant teams (U2). `sub=false` limits it to the team itself.                                                                |
| `multi`                | A multi-select set for group chat (U7). Shown in a selection tray in the shell.                                              |
| `loc`, `floor`, `area` | Only the map uses these. When a `person` is set and their desk is elsewhere, the map changes these params to match the desk. |

- The view tabs render `<Link href={{ pathname: '/org', query: currentParams }}>`. Switching tabs changes only the path (U9).
- `lib/url-state.ts` holds the single nuqs parser definition, which all three views import.
- **Directory:** a table with search and filters for team, location, and "has desk". It scrolls to and highlights `person`. A presence filter appears only when presence display is on: "In / Not in" in `simple` mode, one option per status in `detailed` mode.
- **Map:** described in §6. A deskless person shows a card instead: "{region} [Remote]", or "No desk assigned".
- **Org chart:** opens from the root, or from `person`'s chain, expanded and centered. A toggle switches between the **reporting** tree (managers) and the **team** tree (teams), because these are intentionally separate structures.
- **Person card (shared):** shows photo, title, team chips, manager link, desk link, home region, and chat buttons, plus the presence state for the current display mode (§8.5). All three views use it.
- **Global search (⌘K):** one `/api/search` endpoint. It searches people, teams, and rooms with Postgres `pg_trgm`, which is plenty for fewer than 250 rows each.

### 7.1 User settings (U13)

`/settings`, linked from the top bar, holds each user's own preferences. Any signed-in user can change their own settings, and only their own: the server action takes the email from the session, never from the form. Settings are stored on `app_user` and are not audited, because they change only what that user sees.

**Region display** (`app_user.regionDisplay`) sets how every region code in the app appears to that user: where people are based, deskless cards, and office locations.

| Value                      | `US-CA`                   | `IN` (country only)  |
| -------------------------- | ------------------------- | -------------------- |
| `code`                     | US-CA                     | IN                   |
| `country`                  | United States             | India                |
| `region`                   | California                | India (falls back)   |
| `country_region` (default) | California, United States | India                |
| `flag` (Phase 7 N7)        | 🇺🇸 (United States for screen readers) | 🇮🇳                  |

- Labels are formatted **on the server** by `formatRegion` in `packages/core/regions/iso3166.ts`. Queries such as `loadDirectory(db, regionDisplay)` return the finished label next to the code, so the ISO 3166-2 list (about 5,000 rows) never reaches the browser. Client code must not import that module.
- Country names come from `Intl.DisplayNames`, so they use everyday names ("United States") and can follow a locale later. ICU has no subdivision names, so those come from the ISO 3166-2 list as published (local spellings such as "Karnātaka"). A nested subdivision such as `FR-75C` shows its own name ("Paris, France").
- A code that is no longer in ISO 3166 shows as the raw code, not as an error.
- Filters and URL state use codes, never labels, so a shared link works the same for every viewer.

**Country flags** (`app_user.regionFlag`, Phase 7 #28): a checkbox under the region display that puts the country's flag emoji in front of every region label, in any display mode. The flag travels separately from the label (`regionLabel` returns `{ label, flag }`), is `aria-hidden` in the UI, and the text label always stays, since Windows shows flag emoji as letter pairs.

**Date format** (`app_user.dateFormat`, Phase 7 #27): `iso` (default, `2026-10-04 14:30`), `dmy` (`04/10/2026 14:30`) or `mdy` (`10/04/2026 2:30 PM`), formatted on the server by `formatDateTime` in `packages/core/dates/format.ts`. Times are shown in the viewer's home time zone if they have a person row, else their browser's (a `tz` cookie), else UTC, and timestamps carry the zone's abbreviation. Date filters (the audit log's) are read in the same zone. CSV files always use ISO 8601 in UTC.

---

## 8. Integrations

### 8.1 Google: room status (U5)

- **Import** (an admin button that shows a diff): call `admin.directory.resources.calendars.list` while impersonating `GOOGLE_ADMIN_SUBJECT`. Match rooms to `location` by `buildingId`, to `floor` by `floorName`, and to `area` by `floorSection`. Then the admin links each room to its `room-*` svg id with a dropdown of unlinked ids, pre-filled by fuzzy name matching.
- **Worker `rooms:freebusy` (every 60s, 08:00–19:00 in each location's timezone; every 10 min otherwise):** one `freebusy.query` per 50 rooms for the window from now to the end of the day. The worker derives `free` / `busy` / `soon` (free now, booked within 15 min) and upserts `room_status`.
- **UI:** `/api/rooms/status?floor=…` returns a small JSON map, which SWR polls every 30s. Server-sent events aren't worth the complexity at this scale. If `checkedAt` is more than 5 min old, show rooms grey with a "status stale" note rather than wrong colors. The free, busy, soon, and stale colors come from the `room.*` theme slots (§9.1).
- **Scopes:** `calendar.freebusy` and `admin.directory.resource.calendar.readonly`.

### 8.2 Google: presence from Calendar (U8)

- **Worker `presence:calendar` (hourly, plus once at 07:00 local time):** for each active person, impersonate them and call `events.list` for today through today+7 with:
    - `eventTypes=outOfOffice` → `vacation` (or `ooo` if the event title doesn't look like vacation; the keyword list is configurable)
    - `eventTypes=workingLocation` → `homeOffice` → `wfh`, `officeLocation` → `in_office`, `customLocation` → leave unset
- Upsert into `presence_signal` with `sourceRef = eventId`. Mark signals whose events have disappeared as `retractedAt`.
- Like the Slack source (§8.3), this job is a no-op while `presence.display` is `off`.
- **Scope:** `calendar.events.readonly`. With fewer than 250 users, that's about 250 calls per hour, far under quota.

### 8.3 Slack: presence from channel messages (U8)

This is the requirement: people post in a public channel, for example `#office-status`, and keywords mean WFH or sick. This channel is the main source for the presence display modes in §8.5. While `presence.display` is `off`, the listener and backfill skip the channel entirely: no signals are stored and no reactions are added. The Slack connection still runs for identity and chat (§8.6).

- **Live:** Bolt in Socket Mode subscribes to `message.channels`, filtered to `SLACK_STATUS_CHANNEL_ID`. It handles new messages plus the `message_changed` and `message_deleted` subtypes (which update or retract the signal), and ignores thread replies unless a setting turns them on.
- **Backfill** (on worker start, then every 15 min): call `conversations.history` for the last 48 h, because Socket Mode can drop events while the worker is down. Upserts are idempotent through `UNIQUE(source, sourceRef, date)`, where `sourceRef` is the message `ts`.
- **Parsing** (`packages/core/presence/rules.ts`, a pure function with heavy tests):
    1. Normalize the text: lowercase, strip emoji codes into tokens, and collapse whitespace.
    2. Evaluate the enabled `presence_rule` rows by priority. Seed them from the spike, for example `wfh|working from home|remote today` → `wfh` and `sick|unwell|out sick|:face_with_thermometer:` → `sick`.
    3. Resolve the date scope. The default is **today in the poster's location timezone**. "tomorrow" means +1 day. In v1, `parse` handles only `mon`–`fri` and `until <weekday>` (a range). Don't build a general date parser for v1.
    4. Treat negations ("not sick anymore", "back in office") as their own higher-priority rules that map to `in_office` and override earlier signals that day.
- **Feedback loop:** when a message matches, the bot adds a reaction (for example 🏠 or 🤒) so the poster knows it was understood. When nothing matches, it does nothing. This is the cheapest way to keep the rule table honest. Scope: `reactions:write`.
- An admin page shows **the last 7 days of messages, how each was parsed, and the rule that matched**, so the rules can be tuned against real data.
- **Bot scopes:** `channels:history`, `channels:read`, `users:read`, `users:read.email`, `reactions:write`. Socket Mode also needs an app-level token with `connections:write`.

### 8.4 Presence resolution

`packages/core/presence/resolve.ts` is a pure function:

```
resolve(signals for person+date) → status
precedence: sick > vacation > ooo > wfh > in_office > unknown
tie within same status: latest observedAt wins
explicit "back in office" Slack message on a date overrides wfh signals from Calendar that day
```

`presence_day` is recomputed for the affected (person, date) pairs whenever a signal changes. With no signals, the status is `unknown`, and the UI shows no badge rather than claiming the person is in the office.

**Privacy:** `sick` is health information. By default, viewers see **"Away"** for both sick and vacation, and only admins (and the person themself) see the specific reason. This is a setting to confirm with the people team (§13). Presence pills and desk badges take their colors from the `presence.*` theme slots (§9.1).

### 8.5 Presence display modes (U8)

Presence display is **off by default**. An admin chooses the mode on the Presence admin page (§9). The choice is stored as `app_setting` `presence.display` and recorded in the audit log.

| Mode                 | What viewers see                                                                                                                                                                                                                                                                                                         | Data collected                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `off` (default)      | No presence anywhere: no pills, badges, greying, or presence filter. The "Who's in today" dashboard (Phase 6) is hidden. People appear exactly as they do before Phases 4–5.                                                                                                                                              | None. The presence jobs and listener are no-ops |
| `simple`             | Anyone whose resolved status is anything other than `in_office` or `unknown` is **greyed out**: their directory row, person card, org chart node, and map desk and avatar are rendered at `presence.absent-opacity`. **No reason is shown to anyone**, admins included. Each greyed element also carries the text "Not in today" (a tooltip plus a visually hidden label) so the state isn't conveyed by opacity alone. | Same as `detailed`                              |
| `detailed`           | The status pills and desk badges from U8, with the sick and vacation masking from §8.4.                                                                                                                                                                                                                            | Slack channel (§8.3) and Calendar (§8.2)        |

- `unknown` is never greyed. With no signal, the app makes no claim either way, which matches the no-badge rule in §8.4.
- The mode is resolved **on the server**. `/api/presence` and the server components read `presence.display` first. In `off` mode they return no presence fields. In `simple` mode they return only a boolean `away` per person, never the status, so the reason can't be read from the network tab.
- Turning display on from `off` triggers one Slack backfill run (48 h) and one Calendar run, so today's state is filled in without waiting for the next schedule. Turning it off stops ingestion and hides display immediately. Existing signals age out through the normal 90-day retention (§10), and an admin can purge them early with a "Delete presence data" button.
- A `usePresenceDisplay()` hook (from a server-provided context) is the only way components learn the mode, so every view switches together.

### 8.6 Slack: identity and chat (U7)

- **Matching** (`slack:match-users`, nightly, plus an admin button with a diff): call `users.lookupByEmail` for each person without a `slack` row in `person_identity`. Unmatched people show up in an admin list for manual entry.
- **1:1 chat:** a link to `slack://user?team=T&id=U`, with `https://app.slack.com/client/T/U` as the fallback. This needs no API call.
- **Team chat:** `slack://channel?team=T&id=C` from `team.chatChannelId`.
- **Group DM (2–8 others):**
    1. If the viewer has no Slack row in `messaging_user_token`, the first click sends them through **Connect Slack** (an OAuth v2 user flow with the user scopes `im:write` and `mpim:write`). The token is stored encrypted with AES-256-GCM using `TOKEN_ENC_KEY`.
    2. `POST /api/slack/group-dm {personIds}` calls `conversations.open users=…` as the viewer and returns the channel id. The browser then navigates to the `slack://channel` deep link.
    3. Slack caps a group DM at 9 people including the viewer. Enforce that in the selection tray.

---

## 9. Admin

| Page                   | Capabilities                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Import**             | Upload a CSV for people, teams, or memberships. The people file's `home_region` column takes an ISO 3166 code (`US` or `US-CA`); files that still use the older `home_country` header import unchanged. Each row is validated with zod, then the admin sees a dry-run diff (create/update/error per row) and applies it. Rows can be skipped (one by one, or every row with an error); a row that depends on a skipped one (its manager, the other half of a desk swap, its parent team) becomes an error too, and Apply writes exactly what the dry run showed (Phase 7 #1). Managers are resolved by email in a second pass so the file order doesn't matter. |
| **People / Teams**     | CRUD with cycle-safe manager and parent pickers, desk assignment through a seat picker (a mini map), team membership, and a primary-team flag.                                                                                                     |
| **Locations / Floors** | Create, edit, and archive or delete (Phase 7 #22: archive hides an office or floor everywhere and keeps its history, after the admin confirms who loses a desk; only an office or floor that never had a drawing can be deleted). Each location has an ISO 3166 `region` code, validated like `home_region`), SVG upload with the diff from §6, and version history with rollback.                                                                                                                                                                         |
| **Rooms**              | Google import diff, room ↔ svg id linking, and capacity overrides.                                                                                                                                                                                 |
| **Presence**           | The display mode selector (`off` / `simple` / `detailed`, default `off`, §8.5) with a preview of each mode, and "Delete presence data". Below that, CRUD for rules, a "test this message" box, and the parsed-message log from §8.3.                                                                                                                                                                   |
| **Integrations**       | The last run, status, and stats for each job from `integration_run`, with "run now" buttons. Unmatched Slack users are listed here.                                                                                                                |
| **Branding**           | Upload a tokens file, edit the token → slot mapping, see a live preview of the directory, map, and org chart with the draft theme, read the contrast report, upload logos and fonts, and roll back to an earlier theme version. Export the active theme as DTCG JSON (§9.1). |
| **Backup**             | Export the organization as one passphrase-encrypted file and import one, merging or replacing, with a preview first (Phase 7 #29). |
| **Audit log**          | Every admin write is recorded with before and after JSON. Filterable by entity, date range and actor, paged, and exportable as CSV (`/api/export/audit`, same filters); each export is itself recorded.                                                                                                                                                                              |
| **Export**             | CSV export of people, teams, and seats, so the spreadsheets can be retired safely.                                                                                                                                                                 |

Every admin mutation runs as a server action that calls `requireAdmin()`, validates with zod, writes in a transaction, and records an audit entry.

### 9.1 Theming and branding (U12)

Each deployment serves one organization and has one active theme. An admin can change it at runtime without a rebuild. A tokens file checked into the repo sets the default. The authoring guide for designers lives in `docs/theming.md`.

**Input format.** Accept **W3C DTCG design tokens JSON**, plus the legacy Tokens Studio format through a small adapter. Tokens Studio, Penpot's design tokens, and Figma Variables (through a plugin, or the export available on the org's plan) all produce one of the two. Don't write per-vendor parsers.

**Semantic slots (`packages/core/theme/slots.ts`).** Components read only these slots, never raw brand tokens. Each slot has a default, so a partial theme still renders.

| Group           | Slots                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Surface / text  | `bg`, `fg`, `muted`, `muted-fg`, `card`, `card-fg`, `border`, `ring`                                             |
| Brand           | `primary`, `primary-fg`, `accent`, `accent-fg`, `destructive`, `destructive-fg`                                  |
| Map             | `map.bg`, `map.selection`, `map.highlight`, `map.dim-opacity`, `room.free`, `room.busy`, `room.soon`, `room.stale` |
| Presence        | `presence.in-office`, `presence.wfh`, `presence.away`, `presence.vacation`, `presence.sick`, `presence.absent-opacity` (simple mode greying) |
| Teams           | `team.palette.0` … `team.palette.n`, used when `team.color` is null                                              |
| Type            | `font.sans`, `font.mono`, `font.size.base`, `font.weight.heading`                                                |
| Shape and space | `radius.base`, `spacing.base`, `density` (`compact` \| `comfortable`)                                             |
| Brand assets    | `appName`, `logo.light`, `logo.dark`, `favicon`                                                                  |

Each slot supports a light value and an optional dark value, taken from the token file's modes or sets.

**Import pipeline (`packages/core/theme`, all pure functions):**

1. **Parse** the file into a flat token list (`parse.ts`), then **resolve** aliases such as `{color.brand.600}` and the modes (`resolve.ts`). Reject cycles and missing references with a clear error.
2. **Map** org tokens onto slots (`map.ts`). Organizations name tokens their own way (`brand/blue/600`), so the mapping is suggested from names and types, and the admin edits it. The mapping is stored with the theme, so re-importing an updated export from Figma or Penpot keeps it.
3. **Validate** (`validate.ts`, `contrast.ts`):
    - Every value is parsed with zod into a strict grammar (color, dimension, font-family list, number). Raw strings are never interpolated into CSS, which prevents CSS injection.
    - WCAG AA contrast for each `*-fg` slot against its background, and for presence and room colors against `map.bg` and `card`. A failure blocks saving unless the admin explicitly overrides it, and the report suggests the nearest passing shade.
    - `room.free`, `room.busy`, and `room.soon` must stay distinguishable under common color-vision deficiencies (a ΔE check after simulation).
4. **Emit** (`emit-css.ts`) a CSS string: `:root { --primary: …; … }`, a `.dark { … }` block, and `@font-face` rules for uploaded fonts. `density` sets Tailwind v4's `--spacing` base variable, which scales every spacing utility.
5. **Preview** the draft CSS in an iframe of the directory, map, and org chart, then **apply** it in one transaction as a new `theme` row that becomes active.

**Serving.** `globals.css` uses Tailwind v4 `@theme inline` to point utilities at the slot variables (for example `--color-primary: var(--primary)`), with the defaults from `slots.ts`. The root layout links `/theme.css`, which returns the active theme's `compiledCss` with an ETag and a long cache keyed by the theme version. It's a stylesheet rather than an inline `<style>`, so it fits the CSP in §10. When no `theme` row is active, the route serves OfficeOrg's defaults (the values `theme/default.tokens.json` is generated from), or the file named by the `THEME_TOKENS_PATH` env var, mapped by slot name.

**Fonts and logos.** `next/font` works only at build time, so runtime brand fonts are uploaded WOFF2 files stored as `brand_asset` rows, served same-origin from `/api/brand-assets/[id]`, and declared with generated `@font-face`. SVG logos go through the same sanitize step as floor SVGs (§6). `appName` and the favicon feed Next.js `generateMetadata`.

**Later (Phase 6).** Live sync from the Figma Variables REST API (Enterprise plans only) or the Penpot API, and per-location theme overrides. File upload covers every tool in v1.

---

## 10. Security and operations

- **Authentication:** every route except `/api/auth/*`, `/login`, `/dev/sign-in` (404 outside local development), `/api/health`, and the theme files the sign-in page needs (`/theme.css`, `/api/brand-assets/*`) is protected by the proxy. The domain check (and Google's `hd` check) runs in the Auth.js `signIn` callback, not just in the client prompt hint. Development sign-in methods are not registered in a production build, and `canSignIn` rejects them again if they were.
- **Authorization:** `viewer` can read everything except presence reasons (§8.4). `admin` can write. Every user can change their own settings (§7.1) and a few fields of their own directory entry on `/profile` (preferred name, phone, home time zone, other accounts; Phase 7 #20), found by their session email and audited with them as the actor, and nothing else. Presence is also gated by the display mode (§8.5): `off` exposes nothing, and `simple` exposes only an away flag, to every role.
- **Secrets:** the Google service-account JSON, Slack bot, app and signing tokens, `TOKEN_ENC_KEY`, and `AUTH_SECRET` come from the host's secret store and never live in the repo.
- **DWD blast radius:** grant the service account only the four read-only scopes listed above. Document this in `docs/runbook.md` for the Workspace admin.
- **SVG sanitizing** is described in §6. Also send a CSP with `script-src 'self'` and no `unsafe-inline` scripts.
- **Theme uploads** (§9.1): token values must pass the strict value grammar, so a token file can't inject arbitrary CSS. Uploaded fonts and PNGs are checked by magic bytes, not just the extension, and capped in size (2 MB per font, 1 MB per logo). SVG logos go through the §6 sanitizer. Fonts load same-origin only (`font-src 'self'`).
- **Data retention:** delete `presence_signal` rows older than 90 days in a nightly job.
- **Hosting:** two containers (web and worker) from one Dockerfile with different entrypoints, plus managed Postgres. Good fits: Cloud Run (web) with a GCE VM or a Cloud Run job with `min-instances=1` (worker), Fly.io, or Render. The worker must run always-on because Socket Mode holds a persistent connection.
- **Monitoring:** the worker writes a heartbeat row, and `/api/health` reports stale jobs. Send errors to Sentry, or log to stdout if you don't use Sentry.
- **Backups:** use the managed Postgres point-in-time recovery. Once this tool is the source of truth, backups matter.

---

## 11. Testing strategy

| Layer        | Tool                                               | What it covers                                                                                                                                                                 |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core (pure)  | Vitest                                             | Presence rule parsing (a table-driven test fed by the phrasings from the spike), presence resolution precedence, SVG parsing and diffing, CSV validation, Slack link builders. Theme parsing, alias and mode resolution, and mapping (table-driven against the Penpot and Tokens Studio fixtures from the spike), contrast math, and CSS-emit snapshots. |
| DB           | Vitest + testcontainers Postgres                   | Recursive CTEs, cycle rejection, the desk uniqueness swap, idempotent signal upserts.                                                                                          |
| Integrations | Vitest with recorded fixtures                      | Mapping Google and Slack payloads to the domain types. The fakes satisfy the same interface tests.                                                                             |
| End-to-end   | Playwright on `INTEGRATIONS=fake` with a seeded DB | One spec per user story U1–U13 (U12 applies a fixture theme and asserts the computed `--primary` and logo in each view; U8 runs once per display mode and asserts no presence in `off`, greying with no reason in `simple`, including in the `/api/presence` response, and pills and badges in `detailed`). The seed includes Bob → Max → Jane, HR with two sub-teams, Jane `homeRegion=CA-ON` with a desk, people with both subdivision and country-only codes, a South Wing area, and rooms in each state.      |
| CI           | GitHub Actions                                     | Lint (eslint + typescript-eslint), `tsc --noEmit`, unit, DB, and e2e tests, plus a drizzle migration check.                                                                    |

---

## 12. Delivery plan

These estimates assume one or two engineers. Each phase ends with its user stories passing in Playwright and a demo.

### Phase 0: Spikes (2–3 days)

The five spikes from §2 and `docs/spikes.md`.

- [ ] TODO — Not started. Phase 1 was built first at the user's direction. The spikes need a Google Workspace service account with domain-wide delegation, a Slack workspace, and Figma or Penpot token exports. Phases 4, 5 and 5.5 depend on their outcomes; Phases 2 and 3 do not.

### Phase 1: Foundation (1–1.5 weeks) → U1 (directory part), U4, U10, U13

**Phase status:** all items done and merged into `phase/1-foundation` (2026-10-03). Integration run on the phase branch: 126 unit, 48 database (Testcontainers) and 23 Playwright specs pass. U1 (directory part), U4, U10 and U13 each have a passing spec. Not yet merged into `main`.

**Running it locally:** `docker compose up -d db` (or `docker-compose` without the Compose plugin), copy `.env.example` to `apps/web/.env.local`, then `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. `pnpm test:e2e` builds and serves the app on port 3100 against the `officeorg_e2e` database. On macOS with Colima, database tests need `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`.

- [x] pnpm workspace, Next.js app, worker skeleton, Docker, CI pipeline
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/repo-scaffold`, CI test jobs from `fix/ci-tests`
    - **Notes:** One Dockerfile with `web` and `worker` targets; the web container runs migrations before starting. The worker only logs a heartbeat until pg-boss jobs arrive in Phase 4. ESLint is pinned to 9 because `eslint-plugin-react` (via `eslint-config-next`) breaks on ESLint 10. CI runs lint, typecheck, unit, database and e2e tests, the build, and drift checks for migrations and theme defaults. The workflow has not run on GitHub yet: the repo has no remote.
- [x] Drizzle schema, first migration, seed script
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/db-schema`
    - **Notes:** The whole §5 model is in migration `0000`, including presence, room status and integration tables, so later phases add queries rather than tables. The §5 `theme`, `brand_asset` and `app_setting` tables were added to the plan afterwards and are **not** in the schema yet (Phases 4 and 5.5). Desk codes (`space.name`) are unique among desks only, so rooms can share names across floors. `floor.archivedAt` was added to support "floor must not be archived". The seed uses fixed ids (`p_bob`, `t_hr`, `sp_sf_2_014`, …) that the e2e specs rely on.
- [x] Auth.js with Google, domain restriction, `app_user` roles, admin bootstrap
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/auth`, extended by `feature/auth-sso`
    - **Notes:** Now any SSO provider in `AUTH_PROVIDERS` (google, microsoft-entra-id, okta, cognito, oidc), per the updated Auth decision in §3. Dev-only sign-in (`AUTH_DEV_PASSWORD`, `AUTH_DEV_BYPASS_EMAIL`) works only under `next dev` with a localhost `AUTH_URL`; an e2e spec checks a production build ignores both. Next 16 renamed `middleware.ts` to `proxy.ts`. Roles are read from the database on every request, not the JWT, so demotion is immediate. E2E specs sign in by minting the session JWT with the e2e `AUTH_SECRET`; the real Google round-trip is covered only by `canSignIn` unit tests.
- [x] Semantic token layer: `slots.ts` defaults, `@theme inline` in `globals.css`, and the root layout's hard-coded colors replaced with slot classes. No import UI yet. This is cheap now and expensive once every view uses raw palette classes.
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/theme-tokens`
    - **Notes:** Every view was converted, not just the root layout, because the directory and admin views already existed. Tailwind's default palette is cleared, so a raw class like `bg-white` generates nothing; CI fails on any raw palette class. `app/theme-defaults.css` is generated by `pnpm theme:defaults` and CI fails on drift. Type and shape slots are emitted as `--theme-*` because `--font-sans`, `--radius-*` and `--spacing` collide with Tailwind's namespaces; Phase 5.5's `emit-css.ts` must use the same `cssVar` names from `slots.ts`. Dark values apply through `prefers-color-scheme`; there is no `.dark` class toggle yet. There is no success or warning slot, so success notices use `muted`. `/theme.css` is not built yet; defaults are bundled with `globals.css` until Phase 5.5.
- [x] CSV import/export with dry-run diff, plus an audit log
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/csv-import-audit`
    - **Notes:** Teams import before people. A people row is the person's full state (a blank cell clears a field); people missing from the file are left alone. Imports are all-or-nothing and re-planned inside the write transaction. (Phase 7 #1 later added skipping rows; the rows that aren't skipped are still all-or-nothing.) Exports re-import with no changes (tested). Team leads are not in the CSV and are set in the admin UI. The memberships CSV from §9 is folded into the people file (`teams`, `primary_team` columns).
- [x] People and Teams admin CRUD with cycle checks
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/people-teams-admin`
    - **Notes:** Manager and parent-team loops are rejected by a recursive CTE inside the write transaction; pickers also hide invalid choices. People are deactivated, not deleted. A team with members or sub-teams can't be deleted. Desk assignment is a plain select of free desks; the mini-map picker and the swap transaction are Phase 2.
- [x] Directory view: table, search, filters, person card, URL state (`person`, `team`)
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/directory`
    - **Notes:** URL state is `person`, `team`, `sub`, `q`, `loc`, `desk`, defined once in `apps/web/lib/url-state.ts` for the map and org chart to reuse. Filtering is a pure function in `packages/core/directory`. TanStack Table needs stable `data` and `columns` references or it re-renders forever (this froze the page during development); keep columns at module scope and pass callbacks through `meta`. Inactive people are hidden from the directory. Presence pills and chat buttons arrive in Phases 4 and 5.
- [x] ISO 3166 region codes with subdivisions, and a per-user region display setting (U13, §7.1)
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/iso-3166-regions`
    - **Notes:** Migration `0001` renames `person.home_country` → `home_region` and `location.country` → `region`, widens both from `char(2)` to `text` with a shape CHECK, and adds `app_user.region_display` (default `country_region`). Existing two-letter codes stay valid, so no data changes. drizzle-kit leaves out the type change when a column is renamed in the same migration, so the `ALTER ... TYPE text` lines were added to `0001` by hand. Check for the same gap whenever a migration renames a column. Subdivision data comes from the `iso-3166` npm package (MIT). Upgrading it is how new ISO 3166-2 codes arrive. `requireUser()` now returns `regionDisplay`, so any view can format regions with `formatRegion`. The Phase 2 map and Phase 3 org chart must use it too. The CSV column is now `home_region`; `home_country` is accepted as an alias. The admin person form takes a free-text code with a hint; a searchable picker is a possible Phase 6 item. Country names are English only, because there is no UI locale yet.

### Phase 2: Maps (1.5–2 weeks) → U1, U2, U6, U11

**Phase status:** all items done and merged into `phase/2-maps`, then `dev` (2026-10-03). Integration run on the phase branch: 210 unit, 76 database (Testcontainers) and 52 Playwright specs pass, plus the CI drift checks (migrations, theme defaults, raw palette classes) and the production build. U1, U2, U6 and U11 each have a passing spec (`e2e/specs/map.spec.ts`, `e2e/specs/admin-floors.spec.ts`). Not yet merged into `main`. No schema migration was needed: Phase 1's `0000` already had every map table. Decisions the next phase should know: URL state now imports from `nuqs/server`; the map adds `floor`, `area`, `space` and `view` params; a set `person` decides the map's floor, and choosing a floor by hand clears it. Phase 3's tab links should keep `person` and `team` and can drop the map-only params.

- [x] `docs/map-authoring.md`, plus a sample floor SVG for seeding
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/map-authoring`
    - **Notes:** Two sample floors in `packages/db/seed-floors/` (SF Floor 2 with North and South Wings, Floor 3 with a West Wing), loaded by the seed. Sam now has desk SF-3-001, so HR spans two floors for U2's per-floor counts; the directory and settings specs were updated for that. The guide fixes conventions the parser must follow: a desk's `<floor>` must equal the floor slug, the desk code is `<LOC>-<floor>-<n>`, `room-phone-*` is a phone booth, names come from the slug only on first appearance, and decoration should use `currentColor` so it follows the theme.
- [x] SVG sanitize, parse, and diff pipeline, the upload UI, versions and rollback
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/svg-pipeline`
    - **Notes:** `packages/core/svg/{sanitize,parse,diff,geometry}.ts`. **Departs from §6 step 1:** SVGO runs before DOMPurify, so `inlineStyles` can copy `<style>` rules onto elements before `<style>` is dropped, and the security pass is the last thing to touch the markup. `<style>` is always removed (an inline one would style the whole page). `<use>` is re-allowed because the href hook only permits `#id` or a raster `data:image`. Area membership by nesting, else by the smallest area box containing the element's center; `geometry.ts` computes boxes server-side with transforms (no browser). `sanitize` and `parse` load jsdom and are imported by path only; `@officeorg/core`'s index exports just `diff`, so client code can't pull jsdom in. The seed stores floors through `sanitizeSvg` like a real upload, and a DB test checks each seeded floor diffs to "no changes" against its own drawing. Apply and rollback re-plan inside one transaction with the floor row locked (`FOR UPDATE`). Rollback switches `svgAssetId` back and reconciles rows with the same diff, without adding a version. Archived spaces come back as the same row when their id reappears. Also built, because uploads need somewhere to live: office and floor CRUD at `/admin/locations` and `/admin/floors/[id]` (§9 "Locations / Floors"). Office slugs lock once floors exist, and floor slugs once a drawing exists, because desk codes and desk ids embed them. Audit entities gained `location` and `floor`. The action body limit is now 3 MB for 2 MB drawings, and `jsdom` is in `serverExternalPackages`. Rooms and areas can't be renamed in the UI yet (Phase 4 Rooms page). Tests: 67 unit, 16 DB, 6 Playwright (U11).
- [x] Map renderer: single injection, CSS-state `<style>` block, overlay layer, zoom and pan
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/map-renderer`
    - **Notes:** `/map` (server page) loads one floor via `loadMap` in `packages/db/queries/map.ts`, plus every active person's seat on every floor (`MapSeat`), so later features can follow a person across floors and count team seats without another request. An unknown `loc`/`floor` falls back to the first floor with a drawing. `components/map/floor-map.tsx` injects the drawing in a memoized component that only re-renders for a new asset. `mapStateCss` (`packages/core/map/state-css.ts`) builds the state block from `--map-selection`/`--map-highlight` only, and skips any id that isn't prefix-shaped. Base map styles in `globals.css` are deliberately **unlayered**: for `!important` the cascade inverts layer order, so a layered base rule would beat the state block. Overlay boxes come from `getBBox()` mapped through the screen CTMs, cached per asset id. A click within 5 px of the pointer-down selects; more is a pan. URL state: `lib/url-state.ts` now imports from `nuqs/server` (the main `nuqs` entry is `"use client"`), adds `mapParsers` (`loc`, `floor`, `area`, `space`) and `loadMapParams`. `space` is a map-only param for a selected room or free desk. The shell has Directory/Map tabs with `aria-current`; keeping the query across tabs is still Phase 3. `initials()` moved to `core/directory/filter.ts`. Known gap: in dark mode, a label drawn in `currentColor` over a selected room is low-contrast, because labels are decoration the app doesn't style. Tests: 9 unit, 8 DB, 7 Playwright.
- [x] Location, floor, and area navigation, zoom-to-area with dimming
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/map-navigation`
    - **Notes:** Office picker (shown only with more than one office), floor buttons and area buttons above the map. Floor and office changes use nuqs `shallow: false` so the server sends the new drawing; they clear `area` and `space`. `area` is client-only: `FloorMap`'s `focusAreaId` dims every sibling along the path from the area up to the root (a `data-dim` attribute styled with `--map-dim-opacity`, so the area's own labels stay bright), dims avatars outside the area, and calls the library's `zoomToElement` (it measures SVG elements with `getBoundingClientRect`). The "location overview" from §6 is a side-panel card shown when nothing is selected: each floor's people, desks and rooms, with links. **Free-room counts are deferred to Phase 4**, because they need `room_status`. `MapFloorLink` gained `deskCount` and `roomCount`. Tests: 4 more Playwright specs, including U6.
- [x] Seat assignment (a mini-map picker in admin), swap transaction
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/seat-picker`
    - **Notes:** `components/admin/seat-picker.tsx` replaces the desk select in the person form: floor buttons, the floor's drawing (clicking a desk chooses it, taken desks shaded through a new `occupied` group in `mapStateCss`), and the select kept as the keyboard and screen-reader route, now listing taken desks with the holder's name. Choosing a taken desk shows a "swap desks" confirmation. `PersonForm.swapDesk` (optional) tells `savePerson` to swap. Without it the save is still rejected with the holder's name. The swap runs in the same transaction as the save, ordered for the unique index (holder nulled, person assigned, holder given the person's previous desk or none), and both people get audit entries. `DeskOption` gained `floorId`, `svgElementId` and `assignedPersonName`, and `listPickerFloors` returns each floor's current drawing. `DeskOption.available` is no longer used by the UI but is kept and tested. Also fixed on this branch: leaving an area view mid-zoom stayed zoomed, because `resetTransform(0)` doesn't cancel a running animation (it surfaced as an intermittent U6 failure). Tests: 3 DB, 1 unit, 2 new Playwright specs plus one updated.
- [x] Person focus across floors, team highlight with sub-teams and per-floor counts
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/map-focus-highlight`
    - **Notes:** Focus: `loadMap` takes `person` and opens that person's floor on the server, so a deep link doesn't load one floor and bounce. The client then writes `loc`/`floor` into the URL, follows a selection made on the map (such as a manager link) to another floor, and moves an open `area` to the person's area. Choosing a floor by hand **clears `person`**, or the focus would pull the map straight back. Focus only follows to floors that have a drawing (otherwise it would loop on the server's fallback); a desk on an undrawn floor gets a note. A deskless person gets a "has no desk" note plus the shared card ("{region} Remote"). The person card's desk is now a link to `/map?person=…` (U1). Team highlight: `teamSeats` in `packages/core/map/team-seats.ts` reuses the directory's `teamScope`, so `team` and `sub` mean the same in both views. It works from the seats `loadMap` already sends, so the `teamWithDescendants` and `seatsForPeople` SQL queries listed in §5 were **not needed** and weren't built. The status line shows the per-floor counts as buttons and the members without a desk. Tests: 3 unit, 1 DB, 7 Playwright (U1 and U2 included).
- [x] List fallback for accessibility
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/map-list`
    - **Notes:** A Map/List toggle (`view=list` in the URL; `map` is the default and is left out of the URL) swaps the drawing for `components/map/floor-list.tsx`: a captioned table of the floor's desks, meeting rooms and phone booths. Kitchens, elevators and restrooms are left out because nobody selects them. Each row's button calls the same `select()` as a map click, so the person/room card, the open area (rows filter to it) and the team highlight ("In team" badge) are shared. The selected row has `aria-current`; `aria-selected` isn't valid on a plain table row. Tests: 3 Playwright, including a keyboard-only selection.

### Phase 3: Org chart and selection sync (1 week) → U3, U9

**Phase status:** all items done and merged into `phase/3-org-chart`, then `dev` (2026-10-03). Integration run on the phase branch: 234 unit, 85 database (Testcontainers) and 76 Playwright specs pass, plus the CI drift checks (migrations, theme defaults, raw palette classes). U3 and U9 each have a passing spec (`e2e/specs/org.spec.ts`, `e2e/specs/selection.spec.ts`). Not yet merged into `main`. One migration (`0002`, `CREATE EXTENSION pg_trgm`), so the database user must be allowed to create that extension. Decisions later phases should know: the tab links carry only `selectionParsers`, so Phase 5's `multi` belongs there; presence on the org chart (Phase 4, §8.5) goes into `nodeHtml` in `components/org/org-chart.tsx` and the outline. Known noise, not from this phase: the Playwright server log shows one "The destination stream closed early" during the map's floor-switch spec, on `dev` as well; the spec passes.

- [x] d3-org-chart wrapper (a client component), reporting tree and team tree toggle
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/org-chart`
    - **Notes:** `/org` reuses `loadDirectory`; both trees are built in the browser by pure functions in `packages/core/org/tree.ts`, so the `managementChain` and `reportsTree` SQL queries from §5 were **not needed** and weren't built. Several tops (people without a manager, top-level teams) go under a synthetic root, because the library needs exactly one; a manager missing from the directory (inactive) ends the chain, and a cycle in the data is cut rather than crashing the chart. In the team tree a person appears under every team they belong to (node id `<teamId>:<personId>`); people in no team appear only in the reporting tree. `components/org/org-chart.tsx` loads the library in an effect (its constructor reads `window`) and keeps one data array per tree, because d3-org-chart stores expand/collapse state as `_expanded` flags on the data: a selection or highlight flips flags and redraws, so nodes the viewer opened stay open. Node HTML is built from strings, so every label passes through `escapeHtml` (`packages/core/org/html.ts`). Nodes, links and buttons are styled with theme slots; selection uses `--map-selection`, the same color as the map. URL state adds `tree` (`reporting`, the default and omitted, or `team`) and `view` (`chart` or `list`). A List toggle renders the same tree as nested buttons (`components/org/org-outline.tsx`), the keyboard and screen reader route, as on the map. A new tree opens two levels below the root and fits the screen, which can make a wide team tree small; the zoom and Fit buttons are above the chart. Tests: 17 unit, 5 Playwright.
- [x] Center and expand on `person`, highlight on `team`
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/org-focus-highlight`
    - **Notes:** A set `person` centers the chart on them (in the team tree, on their primary team's membership, else their first team's) and opens their direct reports, even if the viewer had collapsed them. Only a change of selection pans the chart, so a highlight change doesn't pull it back. `team` and `sub` use the directory's `teamScope`, as the map does: in the reporting tree the members light up; in the team tree the team and its sub-teams do, with their members revealed. Clicking a team node highlights it. Highlighted nodes use `--map-highlight`, and a new highlight is framed with `fit`. U3 is a "Reporting line" panel under the person card, from `managementChain` in `packages/core/org/tree.ts` (top down; an inactive manager ends the chain, shown but not clickable). A person in no team gets a note in the team tree. In tests, the expand button is clicked through its `foreignObject`: its visible content has `pointer-events: none`. Tests: 4 unit, 7 Playwright (U3 included).
- [x] Shared nuqs param definitions, tab links that keep the query, ⌘K search
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/selection-sync`
    - **Notes:** `selectionParsers` in `lib/url-state.ts` (`person`, `team`, `sub`) is the shared definition; each view adds its own params on top. **Departs from §7:** the tab links carry only the selection, serialized with nuqs `createSerializer`, not the whole query. View params don't mean the same thing elsewhere: the map always writes `loc` once it follows a person, and carried to the directory it would filter by office and could hide the person being followed. `multi` (Phase 5) should join `selectionParsers` so the tabs carry it. ⌘K: `GET /api/search?q=` (any signed-in user, `no-store`) runs `search` in `packages/db/queries/search.ts`: active people by name, preferred name, email or title, teams by name or slug, and non-archived meeting rooms and phone booths (6 of each). A name containing the query always matches, and pg_trgm `word_similarity` ≥ 0.45 adds typo tolerance; names starting with the query rank first. 0.45 was measured: longer-word typos score above 0.6, while "board" against "Phone Booth" scores 0.33. LIKE wildcards in the query are escaped. Migration `0002` is a custom drizzle-kit migration that only runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`; no trigram indexes, as a scan of fewer than 250 rows is fast. The palette (`components/search/command-palette.tsx`) is a native modal `<dialog>` with an ARIA combobox and grouped listbox. A person or team becomes the selection in the current view and keeps that view's params (the org chart's `tree`, for example). From a non-view page such as Settings it goes to the directory. A room opens `/map?loc&floor&space`, keeping `team`/`sub` and dropping `person`, as a map click does. Tests: 2 unit, 9 DB, 6 Playwright.
- [x] Playwright: select Bob in each view, switch tabs, and assert focus each time
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/selection-e2e`
    - **Notes:** `e2e/specs/selection.spec.ts` (U9) selects Bob in each view in turn (a directory row, a map desk, an org chart node), goes round all three tabs, and checks each view's own sign of focus: the directory row's `aria-selected` and card, the desk's fill from `--map-selection`, and the org chart node's `data-selected` with the reporting line. It also checks that a new selection in one view is what the next shows, that `team` and `sub` carry into all three, and that closing the card clears the selection for the other tabs. Tests: 6 Playwright.

### Phase 4: Google (1 week) → U5, U8 (Calendar part)

- [ ] Service account wiring and adapters, with fakes
- [ ] Room import diff and svg id linking UI
- [ ] `rooms:freebusy` job, `/api/rooms/status`, red/green/amber/stale rendering
    - **Note:** the rendering is done (Phase 5.5, `feature/room-status-cue`): `loadMap` reads `room_status` and the map, card and list show each state. What remains is the job, the endpoint, and SWR polling that refreshes `MapSpace.status` between page loads.
- [ ] `presence:calendar` job, `presence_signal` → `presence_day` resolution
- [ ] `app_setting` table and the `presence.display` setting (default `off`), with presence jobs that do nothing while it is off
- [ ] Display modes (§8.5): `simple` greying and `detailed` pills, desk badges, and privacy masking across directory, map, and org chart. Server-side filtering of presence fields by mode
- [ ] Display mode selector on the Presence admin page, with "Delete presence data"

### Phase 5: Slack (1–1.5 weeks) → U7, U8 (Slack part)

- [ ] Slack app manifest checked into the repo (`slack/manifest.yaml`)
- [ ] `slack:match-users` and the unmatched list
- [ ] 1:1 and team deep links, selection tray, Connect Slack OAuth, group DM endpoint
- [ ] Socket Mode listener for the status channel, backfill job, rule engine, reaction feedback, all gated on `presence.display` (§8.5), plus a backfill when display is switched on
- [ ] Presence rules admin, "test this message" box, parsed-message log

### Phase 5.5: Branding (1 week) → U12

**Phase status:** all items done and merged into `phase/5.5-branding`, then `dev` (2026-10-04), ahead of Phases 4 and 5 at the user's direction (no Google or Slack access); it depends only on Phase 1's token layer. Integration run on the phase branch: 330 unit, 94 database (Testcontainers) and 89 Playwright specs pass, plus the CI drift checks (migrations, theme defaults, raw palette classes) and a production build with no database. U12 has a passing spec (`e2e/specs/admin-branding.spec.ts`). Not yet merged into `main`. One migration (`0003`, `theme` and `brand_asset`). **Not verified against real exports:** the Phase 0 design tokens spike hasn't run, so parsing is tested on hand-written fixtures of the Figma, Tokens Studio and Penpot formats; run real exports through the Branding page when the spike happens. Decisions later phases should know: every page now reads the active theme (`getBrand` calls `connection()`), so the e2e server migrates before starting; `/theme.css` and `/api/brand-assets/*` are public; presence UI (Phase 4) must use the `presence.*` slots and `presence.absent-opacity`; room status rendering is done, and Phase 4 adds the worker, `/api/rooms/status` and polling. Also on this phase: the search specs' ⌘K helper retries until hydration, because the render-blocking theme stylesheet widened a pre-existing race. Default colors changed: light `room.busy` `#b91c1c`, light `room.stale` `#6b7280`.

- [x] `docs/theming.md` and `theme/default.tokens.json`
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/theme-docs-defaults`
    - **Notes:** `theme/default.tokens.json` is **generated** from `slots.ts` by `pnpm theme:defaults` (alongside `theme-defaults.css`) through the DTCG exporter, and CI's drift check now covers both files; it's in `.prettierignore` so a formatter can't break the check. Edit `slots.ts`, never the file. Token paths are the slot names and dark values are in `$extensions.mode`, so the file is also the reference example of a complete theme. An organization's own deploy-time default goes through `THEME_TOKENS_PATH` (item 3), not by editing this file. `docs/theming.md` is for designers and admins: export steps per tool, sets and modes, references, the slot reference, the value grammar, mapping suggestions, dark mode and the contrast rules. Its sections on the Branding page, uploads and `THEME_TOKENS_PATH` are added with the features that build them; until then a status note says the page is still being built. A unit test fails if a slot is missing from the guide.
- [x] Token parse, alias and mode resolution, slot mapping, and validation in `packages/core/theme`
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/theme-core`
    - **Notes:** Pure modules: `parse.ts` (DTCG and legacy Tokens Studio, either syntax in a multi-set file marked by `$themes`/`$metadata`; a single DTCG file is one set named after the file), `resolve.ts` (aliases per mode), `map.ts` (suggestions and `applyMapping`), `validate.ts` (zod-based value grammar), `contrast.ts`, `emit-css.ts`, plus `color.ts`, `values.ts`, `export.ts` (DTCG export) and `build.ts` (the whole pipeline in one call, used by preview and apply). **Modes:** a set whose name contains the word "dark" or "light" applies only in that mode, other sets are a base for both, and a token's `$extensions.mode: {light, dark}` (Terrazzo's convention) wins over both. `$themes` itself is not read. **Errors vs. warnings:** circular and missing references, bad JSON and values that fail the grammar are errors and block applying. Tokens Studio math (`{space.1} * 2`), composite types (typography, shadow) and names containing `.` or braces are skipped with a warning, so an unrelated token can't block an import. A mapped token that disappears on re-import falls back to the default with a warning. **Dark mode is an explicit switch** on the theme (`darkMode`): off means light-only (`color-scheme: light`, no dark block). With it on, a slot mapped to a single-mode token uses that value in both modes, and an unmapped slot keeps its default dark value. **Contrast:** 4.5:1 for the `*-fg` pairs and `destructive` on `bg`. 3:1 (WCAG non-text contrast) for room and presence colors on `map.bg` and `card`. Room free/busy/soon must stay ΔE<sub>OK</sub> ≥ 0.06 apart under protanopia, deuteranopia and tritanopia (Machado 2009 simulation). A failure suggests the nearest passing shade (OKLab lightness, hue kept). **Default palette changed to pass its own gate:** light `room.busy` `#dc2626` → `#b91c1c` (red and green were ΔE 0.05 apart for deuteranopes) and light `room.stale` `#9ca3af` → `#6b7280` (2.4:1). `font.mono`'s default is now in canonical quoted form. `defaultThemeCss` moved from `slots.ts` to `emit-css.ts`, so the bundled defaults and imported themes share one emitter. **Fixtures are hand-written** from the published Figma, Tokens Studio and Penpot formats, because the Phase 0 design tokens spike hasn't run. Replace them with real exports when it does. Tests: 87 more unit tests (321 in core).
- [x] `theme` and `brand_asset` tables, `/theme.css` route, `/api/brand-assets/[id]`
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/theme-serving`
    - **Notes:** Migration `0003` adds both tables. **Departs from §5:** `theme` also stores `values` (the validated slot values by mode), so a request reads the app name and logo ids, and an export is written, without rebuilding the theme; `version` is unique. `brand_asset.bytes` is a `customType` (Drizzle has no bytea), and `meta` holds `{ family, weight, style }` for fonts plus `fileName`. `packages/db/queries/theme.ts`: `applyTheme` re-runs the whole pipeline inside its transaction under an advisory lock (concurrent applies get distinct versions), refuses errors always and contrast failures unless overridden, and checks each logo/favicon slot points at an upload of the matching kind. `activateTheme(id | null)` rolls back without adding a version; `null` returns to the deploy default. Identical uploads are reused (jsonb doesn't keep key order, so metadata is compared with sorted keys). Audit entities `theme` and `brand_asset`. Upload checks are pure in `core/theme/assets.ts`: type by magic bytes (PNG, SVG, WOFF2 only), 1 MB images and 2 MB fonts; SVG sanitizing comes with the upload action in item 4. Web: `lib/theme.ts` (`getCurrentTheme`, `getBrand`), with `THEME_TOKENS_PATH` mapped by slot name only and read once per process; a bad file is logged and the built-in defaults are served. The root layout links `/theme.css?v=<hash>` (immutable for the current hash, `no-cache` + ETag otherwise) and sets the title and favicon through `generateMetadata`. `getBrand` calls `connection()`, so every page, including `/forbidden` and `/_not-found`, is now rendered per request and the build never needs a database. `globals.css` imports the defaults into a `theme-defaults` cascade layer, so the unlayered `/theme.css` wins regardless of stylesheet order. `BrandMark` shows the logo (the dark one only if the theme has dark mode) or the app name in the shell, admin and sign-in headers. `/theme.css` and `/api/brand-assets/*` are public; asset responses are immutable, `nosniff`, and carry a sandboxing CSP. The e2e server now runs `db:migrate` before starting (as the web container does), because every page reads the theme table. Tests: 6 unit, 9 DB, 4 Playwright (`e2e/specs/theme.spec.ts`).
- [x] Admin Branding page: upload, mapping editor, contrast report, live preview, logo and font upload, versions and rollback, DTCG export
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/branding-admin`
    - **Notes:** `/admin/branding` (nav "Branding"). The client editor (`components/admin/branding/`) keeps the draft (files, mapping, dark-mode switch, fonts) and re-previews on the server 250 ms after each change, dropping stale responses; new files trigger `suggestMapping` once their tokens are known, and the first files set the dark-mode switch. The draft starts from the active theme's stored sources and mapping, and the editor is keyed by the active theme id, so applying or rolling back reloads it; the result notice travels in the URL (`?applied=`, `?activated=`). Slot rows offer only type-compatible tokens; a mapped token that went missing stays visible as "(missing)". "Use #… for slot" in the contrast report converts the slot to a custom value. **Preview:** the real `/directory`, `/map` and `/org` in a same-origin iframe, with the draft CSS added as a constructed stylesheet kept per document (navigating from the initial `about:blank` keeps the Window but not the Document). The iframe's header still shows the active name and logo; a strip above it shows the draft's. **Uploads** go through `uploadBrandAssetAction` (magic bytes, size caps, SVGs through `sanitizeSvg`) and are stored at once; a theme uses them only once applied. `themeInputSchema` (draft + font ids) lives in core so the web app needs no zod. Export is `GET /api/export/theme` (admin only). **Added:** `font.sans` and `font.mono` get `sans-serif`/`monospace` appended when the list has no generic family, because the preview showed a Tokens Studio file naming only "Inter" falling back to serif. Rolling back to the default doesn't reset the draft's uploads. Tests: 1 unit, 6 Playwright (`e2e/specs/admin-branding.spec.ts`, U12 included).
- [x] Map and presence colors switched to slot variables, plus the non-color room status cue
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/room-status-cue`
    - **Notes:** No view used a literal color any more (checked with a grep; the CI palette check guards it), and no presence UI exists yet, so presence colors need nothing here. Phase 4 must use the `presence.*` slots. The work was room status: `core/map/room-status.ts` (`roomDisplayState`: a status more than 5 minutes old is `stale`; labels), `MapSpace.status`, and `loadMap` reading `room_status` for the floor's rooms per request. `mapStateCss` gained a `rooms` group: a 25% tint of the `room.*` color mixed into `card` with a solid 3px outline in that color. **A solid fill was tried first** and made the drawing's room labels (decoration in `currentColor`) unreadable on busy rooms; the outline and cue are what the theme's 3:1 check guarantees. The rules come before the selection, so a selected room shows the selection outline. **Non-color cue:** an overlay badge at each room's top-right corner, a tick (free), a no-entry bar (busy), clock hands (soon), or a dashed ring with "?" (stale), with a `<title>`; dimmed outside an open area. The room card has a Status row and the list view adds the label. Tests: 2 unit, 3 Playwright (`e2e/specs/room-status.spec.ts`, which inserts `room_status` rows as the Phase 4 worker will).

### Phase 6: Polish (ongoing)

- [ ] Mobile layout: map as full-screen sheet, directory first
- [x] Click-to-place seat editor in the app, so new desks don't need a Figma round-trip (done as Phase 7 #21 step 2, 2026-10-04)
- [ ] "Who's in today" dashboard per location (shown only when presence display is on, §8.5)
- [ ] Optional HRIS sync, which replaces CSV as the people source
- [ ] Live theme sync from the Figma Variables REST API (Enterprise plans only) or the Penpot API
- [ ] Per-location theme overrides
- [ ] Searchable ISO 3166 region picker in the admin person and location forms, in place of the free-text code
- [ ] A UI locale setting (§7.1), so country names in region labels follow the user's language

**Total: about 7.5–9 weeks for one engineer, or about 4.5–5.5 weeks for two.** Two engineers can split phases 2 and 3, and phases 4 and 5, in parallel. Phase 5.5 depends only on Phase 1's token layer, so it can run alongside any later phase.

### Phase 7: Improvement

The improvement backlog raised after Phases 1–3. Each item keeps its number from the original backlog note (a local, gitignored `note.md`, since replaced by a newer list). Finished items record what was built; open items carry the essentials of the note's design below, so nothing depends on that file any more. Items are in the note's suggested order: the vendor-neutral schema first (cheap while Phases 4 and 5 are unbuilt), then quick UI wins, data quality, the people model, settings, map and admin, and the rename last. Feature branches merge into `phase/7-improvement`.

**Phase status:** in progress, started 2026-10-04.

**G. Vendor-neutral schema**

- [x] #12 Extra account identities (GitHub, LinkedIn, …)
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/person-identities`
    - **Notes:** Migration `0004` adds `person_identity` (§5). The registry is `packages/core/people/identities.ts`: profile providers `github`, `gitlab`, `linkedin`, `website`, each with `normalize` (accepts a handle, `@handle` or profile URL; handles are lowercased) and `url`. `identityLinks` builds every link the card shows. `PersonRecord.identities` holds profile accounts only, and `diffPersonRecords` reports one change per provider (`github: old → new`). The people CSV has `github`, `gitlab`, `linkedin`, `website` columns after `primary_team`, in registry order (a test keeps them in step). **Departs from the full-state rule:** a blank cell clears an account, but a file *without* the column keeps the person's current value (`ValidPersonRow.keepIdentities`), so a spreadsheet from before the columns existed doesn't wipe accounts. `parseCsv` now returns `headers` for that. Duplicates are refused in the form (naming the holder, field `identities.<provider>`) and in the import planner (claims work like desk claims, so two people can swap accounts in one file). `savePerson` and the import replace only profile rows, so #4's messaging ids survive. The card shows labelled text links ("GitHub"), not icons, because no icon library is installed. Bob has seeded GitHub and LinkedIn accounts. The person action now reports nested field paths (`identities.github`). Tests: 32 unit, 4 DB, 1 Playwright.
- [x] #4–6 Provider-agnostic messaging, calendar and room status: schema renames
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/vendor-neutral-schema`
    - **Notes:** Migration `0005` (§5 updated): `person.slack_user_id` → a `slack` row in `person_identity` (the registry has a `slack` provider of kind `messaging`, read-only: the form schema refuses it and saves keep it); `slack_user_token` → `messaging_user_token` with PK `(person_id, provider)`; `team.slack_channel_id` → `chat_channel_id`; `space.google_resource_email` → `calendar_resource_id`; `location.google_building_id` → `external_building_id`; `presence_source` values → `message`, `calendar_ooo`, `calendar_working_location`, `manual`, plus `presence_signal.provider` (NOT NULL), now part of the `presence_signal_source` unique index. Existing values are carried over, not dropped. The teams CSV reads `slack_channel_id` as an alias; the team form says "Chat channel ID". **The migration is hand-written**, because drizzle-kit asks interactively about renames. The snapshot was produced from `schema.ts` with `generateDrizzleJson` from `drizzle-kit/api`, keeping the id chain of a `generate --custom` file. `drizzle-kit generate` reports no changes, and a database built from `0000`–`0005` dumps the same schema as one built by `drizzle-kit push` (compared once by hand). Use the same method for the next rename. §3, §4 and §8 still describe Slack and Google directly; rewrite them with the interfaces item below. Tests: 5 unit, 1 DB updated.

**A. Quick UI wins**

- [x] #8 Strike through inactive people in the admin list
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/admin-inactive-strike`
    - **Notes:** The name in `/admin/people` gets `line-through text-muted-fg` plus a visually hidden " (inactive)". Inactive people are not sorted last; #9's status filter (default: active) hides them instead. Tests: 1 Playwright.
- [x] #14 Click anywhere in a directory row to select it
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/directory-row-click`
    - **Notes:** `onClick` on the `<tr>` ignores clicks inside `a,button,input,select`, so #15's desk link navigates. Rows get `cursor-pointer` and `hover:bg-muted`; no `tabIndex`, the name button stays the keyboard route. The selected row has `aria-current="true"` instead of `aria-selected` (`selection.spec.ts` updated). Tests: 1 Playwright.
- [x] #15 Desk code in the directory links to the map
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/directory-desk-link`
    - **Notes:** `LocationLabel` takes `linkDesk`; only the directory's Location column sets it, because the card has its own desk link. The link is `/map?person=…` with `aria-label="Show <desk> on the map"`, the same as the card's. "Remote" stays a plain badge. Tests: 1 Playwright (Sam's desk on Floor 3, so the map switches floors).
- [x] #24 Team highlight lights up members in the team tree
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/org-team-member-highlight`
    - **Notes:** `teamHighlightIds("team", …)` adds `memberNodeId(team, person)` for each membership of an in-scope team. Bob's node under HR stays unlit when only Payroll is highlighted. Member nodes use the same `--map-highlight` ring as team nodes; a lighter style wasn't needed. The `chart.fit` framing on more nodes looked fine. Tests: 1 unit added and 1 updated, 2 Playwright updated and 1 added.
- [x] #25 Include sub-teams by default
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/subteams-default`
    - **Notes:** `selectionParsers.sub` defaults to `true` and `EMPTY_FILTERS.includeSubteams` is `true`. Only `sub=false` appears in URLs (nuqs `clearOnDefault`); the palette copies the raw value, so `sub=false` carries into room links. Every `sub: null` reset now means "include". §7 updated. The branch also carries a fix to `map.spec.ts` U1, which #15 broke (the list row and the card both had a "Show SF-2-014 on the map" link). Tests: 1 unit rewritten; 5 Playwright specs rewritten and 1 added (`sub=false` carries across tabs).
- [x] #9 Filter the admin lists
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/admin-list-filters`
    - **Notes:** `packages/core/admin/filter.ts`: `filterAdminPeople` (text, team with `teamScope`, `status` active/inactive/all, `desk` any/with/without) and `filterAdminTeams` (name/slug match plus ancestors; `matched` vs `visible`). `matchesQuery` was extracted from `filterDirectory`, and `teamScope` now takes any `{ id, parentTeamId }[]`. The pages are client tables (`components/admin/{people,teams}-table.tsx`) with nuqs params `adminPeopleParsers` (`q`, `team`, `sub`, `status`, `desk`) and `adminTeamsParsers` (`q`); defaults stay out of the URL. **Status defaults to `active`**, so #8's strike-through shows when "Inactive" or "Active and inactive" is chosen. Test note: nuqs writes the URL a moment after a change, so a spec that reloads must wait for the URL first. Tests: 8 unit, 2 Playwright, 1 updated.
- [x] #17 Export the audit log
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/audit-export`
    - **Notes:** `packages/core/csv/audit.ts` (`auditToCsv`, `changedFields`, `summarizeAuditChange`, moved from the page). `listAudit` takes `entity`, `from`/`to` (inclusive UTC dates), `actor` (contains, wildcards literal via `containsPattern`), `beforeId` (keyset paging) and `limit` (`null` = all). `AUDIT_ENTITIES` is now exported from `queries/audit.ts`. Page: a GET filter form, 100 rows a page with "Older →"/"← Newest", and "Export CSV" with the same query; the filters are parsed once in `apps/web/lib/audit-filters.ts` for both. **Decided:** exports are audited (`entity: "audit_log"`, `action: "export"`, `after: { filters, rows }`). Times are still shown in UTC (column header says so); #27 adds the user's format and zone. Tests: 5 unit, 6 DB, 2 Playwright.

**B. Data quality**

- [x] #10 CSV import handles non-UTF-8 files
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/csv-encoding`
    - **Notes:** `packages/core/csv/decode.ts` `decodeCsv(bytes, encoding?)`: UTF-16 by BOM (or by the zero bytes of BOM-less UTF-16, marked `guessed`), then strict UTF-8, else Windows-1252 (`guessed`). The panel reads `file.arrayBuffer()`, decodes in the browser, shows "Read as …" (a `status` named "<kind> file encoding") and a select to re-read the bytes as another encoding. **Beyond the note:** `parseCsv` detects the separator (comma, semicolon or tab) from the header row, because Excel's UTF-16 "Unicode Text" is tab-separated and its CSV uses semicolons in decimal-comma locales; and the dry run lists a *new* row's fields too, since it showed nothing for creates and there was no way to check names. Cells are NFC-normalized in `parseCsv`. Secondary hardening done: `initials()` takes whole graphemes (`Intl.Segmenter`); `docs/map-authoring.md` says why slugs stay ASCII. **Not done:** accent-insensitive search (`unaccent`), left until #2 rewrites `search.ts`; internationalized emails (low priority, only if an SSO provider sends them). Tests: 12 unit, 2 Playwright.
- [x] #18 Validate time zones
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/timezone-validation`
    - **Notes:** `packages/core/time/zones.ts`: `canonicalTimeZone` (fixes the case only and keeps aliases as given; refuses UTC offsets, which Intl accepts), `isTimeZone` (moved from `spaces/form.ts`), `timeZoneOptions` (adds `UTC`), and zod helpers `timeZoneSchema`/`optionalTimeZoneSchema`, used by the office form, the person form and the people CSV. **Don't store `resolvedOptions().timeZone`:** it swaps aliases for ICU's preferred ids, which are the old names (Node turns `Asia/Kolkata` into `Asia/Calcutta`, `Europe/Kyiv` into `Europe/Kiev`). The first version did, and the export round-trip DB test caught it; fixed on `fix/timezone-aliases`. `components/admin/time-zone-list.tsx` renders the `<datalist>` only in the browser (via `useSyncExternalStore`), because Node's and the browser's zone lists differ. Existing bad values aren't migrated: a re-import shows them as row errors, and the form refuses to save them. Tests: 13 unit, 1 Playwright.
- [x] #19 Default time zone from the desk's office
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/timezone-from-desk`
    - **Notes:** Step 1 (desk office) only. `defaultTimeZone(explicit, deskZone)` in `core/time/zones.ts`, applied in `savePerson` (looks up the desk's `location.timezone`) and in `planPeopleImport` (`DeskInfo.timezone`, loaded by `loadPeopleSnapshot`), so the dry run shows it. **Decided:** stored, not computed at read time, and applied *whenever* the zone is blank on a save or import row, not only on create; a later desk move doesn't update an already-stored zone. Consequence: people stored before this with a desk and no zone show `homeTimezone: — → …` once on their next import or save. The seed's desk holders (Max, Bob, Sam) now have `America/Los_Angeles`, keeping the export round-trip test meaningful. A desk-swap holder isn't re-defaulted. `DeskOption` gained `locationName` and `timezone` for the form's placeholder and hint (the hint sits outside the `<label>`, so it isn't part of the input's name). **Not built:** step 2, the region fallback for deskless people, which needs a country → zones dataset. Tests: 3 unit, 2 DB, 1 Playwright.
- [x] #13 Phone number normalization
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/phone-normalization`
    - **Notes:** New dependency `libphonenumber-js` (MIT, `min` metadata) in `packages/core`. `core/people/phone.ts`: `normalizePhone(raw, homeRegion)` → E.164, or `+…;ext=N` with an extension (RFC 3966 form, which the library parses back); `displayPhone(stored)` → `{ uri, label }`, with `uri: null` for a value that doesn't parse. The person form normalizes in a final `.transform` (it needs `homeRegion`), the CSV in `validatePersonRow`. **Server-only formatting:** `DirectoryPerson.phone` is `{ uri, label }` built in `loadDirectory`, so client code must not import `people/phone` (no client component does; the index is only type-imported there). The card shows a `tel:` link. `/admin/people` lists stored numbers that don't parse ("Phone numbers to fix"); saving the person normalizes or rejects each. No data migration. The person form gained a phone field error. Seed: Jane and Bob have numbers, so the export round-trip test covers phones. Tests: 17 unit, 2 Playwright.
- [x] #1 Skip rows in a CSV import
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/import-skip-rows`
    - **Notes:** `RowAction` gained `"skipped"` (and `counts.skipped`). `planPeopleImport` and `planTeamsImport` take `skip: ReadonlySet<number>` (file line numbers) and drop those rows before building `desired`, so dependants fail through the existing checks; their messages name the skipped line (manager, desk swap, parent team). `planSkippingErrors` in `core/import/plan.ts` re-plans until no errors remain and keeps each skipped row's reason. `canApply` = no errors and at least one row that isn't skipped. DB: `planPeopleCsv`/`planTeamsCsv(db, text, { skip, skipErrors })` return the final `skip`; `applyPeopleCsv`/`applyTeamsCsv(…, skip)` re-plan with it; `ApplyResult.skipped`. Actions take `{ text, skip, skipErrors }`. UI: a Skip checkbox per row (shown at once, then replaced by the server's list), "Skip all rows with errors", and stale preview answers dropped by a request counter. Skipped rows write nothing, including no audit entry (the optional summary entry wasn't added). §9 Import and the Phase 1 note updated. Tests: 7 unit, 2 DB, 2 Playwright (1 rewritten).

**C. People model**

- [x] #2 Given and family name as separate fields
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/given-family-name`
    - **Notes:** Migration `0006` (hand-written, same snapshot method as `0005`): `given_name` NOT NULL, `family_name` nullable, backfilled by splitting at the last whitespace (whitespace inside a name is normalized to one space; checked on sample rows), and `name` re-created as `GENERATED ALWAYS AS (…) STORED NOT NULL`. **Departs from the note:** `name` stays generated rather than being dropped after a release, so every reader of the full name (search's trigram match, org tree, map, pickers, audit labels) is unchanged and only writers moved to the parts. Dropping it later means switching those reads to `fullName()`. `core/people/names.ts`: `splitFullName` (the migration's rule), `fullName`, `compareByFamilyName` (fixed `Intl.Collator("en")`, so server and browser agree; "Å" sorts with "A"). `personInitials` uses the first given name and the family name. `PersonRecord`/`PersonForm` have `givenName`/`familyName`; `PERSON_FIELDS` diffs them separately. CSV: `given_name`, `family_name`; a file with only `name` is split and the dry run shows a notice (`PlanResult.notices`, rendered as a `note`). Lists sort in JS after loading (`loadDirectory`, `listPeopleForAdmin`). Family-name-first order is out of scope (`fullName` is the place to add it). Tests: 18 unit, 4 DB, 1 Playwright; 3 specs updated for the form fields.
- [x] #11 Default manager from the primary team's lead
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/default-manager`
    - **Notes:** `inheritedManager(personKey, primaryTeamKey, teams)` in `core/teams/tree.ts` (generic keys: ids in `savePerson`, slugs and emails in the import; walks up past a team whose lead is the person, or that has no lead; cycle-safe). `PeopleSnapshot.teams` holds parent slug and lead email per team (leads come from the database; the CSV has none). **Open questions, settled with the note's recommendations:** (1) a primary-team change re-defaults the manager only if the current one was the old team's default (done in the form, which knows); (2) changing `team.leadId` does **not** reassign members; the recommended confirm step on the team form is not built; (3) a blank manager means "default" in the form and the CSV. **Added:** a default that would close a loop is dropped (the person gets no manager) rather than rejected. The form's empty manager option reads "Default: <name>, lead of <team>". Tests: 12 unit, 2 DB, 1 Playwright.
- [x] #23 Auto-add parent-team memberships
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/inherited-team-memberships`
    - **Notes:** Confirmed with the project owner after #25 shipped (2026-10-04): build it. Migration `0007` adds `team_member.source` (`membership_source` enum, default `explicit`) and backfills inherited rows. `syncInheritedMemberships` (`packages/db/queries/memberships.ts`) deletes and rebuilds every inherited row from the explicit ones with a recursive CTE; it runs at the end of `savePerson`, `applyPeopleCsv`, `saveTeam` and `applyTeamsCsv` (a team move moves its members' inherited memberships). That answers the note's open question: removing the last sub-team membership removes the inherited one, never an explicit one. **Views match explicit memberships** (`explicitTeams` in `core/directory/filter.ts`, used by `filterDirectory`, `filterAdminPeople`, `teamSeats`, `teamTree`, `personNodeId`, `teamHighlightIds`), so a team means what it did before and "Include sub-teams" (#25) still matters; the team tree doesn't repeat people under ancestors. `PersonRecord.teamSlugs` and `PersonForm.teamIds` are explicit only, so the CSV round-trip is stable. Inherited memberships show as dashed `TeamChip`s ("through a sub-team"), ticked and locked in the person form ("through Recruiting"), and count in `listTeamsForAdmin`. **Not in the note's form step:** an inherited team can't be unticked, since membership follows from the sub-team. Tests: 8 unit, 4 DB, 1 Playwright.

**F. Settings, E. Map, D. Admin**

- [x] #27 Date format setting (ISO, DMY, MDY)
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/date-format`
    - **Notes:** Migration `0008` (`date_format` enum, `app_user.date_format` default `iso`; its own migration rather than shared with #28, so each feature commits alone). `core/dates/format.ts`: `DATE_FORMATS`, labels, `formatDate`, `formatDateTime(d, fmt, zone, { zone })` from `formatToParts` (fixed `en-US` parts, not the locale's layout), and `startOfDay(date, zone, addDays)` (DST-safe). `CurrentUser` gained `dateFormat` and `timeZone` (home time zone via `findHomeTimeZone`, else the `tz` cookie written by `components/time-zone-cookie.tsx` in the root layout, else UTC). `setRegionDisplay` → `setUserSettings(email, partial)`. Applied to the audit log (and its date filters: `AuditFilters.timeZone`), floor versions and theme versions; the latter two moved from client `toLocaleString()` to server-formatted labels. Exports stay ISO UTC. §7.1 updated. Tests: 20 unit, 2 DB, 1 Playwright.
- [x] #28 Country flag option for region display
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/region-flags`
    - **Notes:** Migration `0009` (`app_user.region_flag` boolean, default false; own migration, see #27). Core: `flagEmoji(code)` (country part → regional indicators; null for an unassigned country), `RegionFormat { display, flag }`, `DEFAULT_REGION_FORMAT`, `regionLabel(code, format) → { label, flag }`. `loadDirectory` and `loadMap` take a `RegionFormat` (`regionFormatOf(user)` in `lib/session.ts`); `DirectoryPerson.homeRegionFlag` and `MapLocation.regionFlag` carry the flag, shown `aria-hidden` before the label in `LocationLabel` and the map's office overview. Admin pages still show raw codes, as before. Settings: a "Show country flags" checkbox (avoids a "Country …" label, which the region e2e regexes match). **Also on this branch:** `e2e/support/session.ts` `switchUser`, which leaves the page before changing cookies, because a prefetch in flight re-set the old user's session cookie (Auth.js refreshes it on every response); the #27 spec's other-user check had passed only by coincidence. Tests: 7 unit, 2 DB, 1 Playwright.
- [x] #26 App draws room and POI names on the map
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/map-labels`
    - **Notes:** `core/map/labels.ts` `labelLayout(box, name, kind)`: rooms centred, up to 18 units, shrunk to fit (0.6 em glyph estimate), truncated with "…" at 9 (full name in a `<title>`), left out when even three characters don't fit; areas at the top-left corner, 16 units. **Decided:** labels always show at a size fitted to the drawing, rather than hiding by zoom level (no zoom-aware layout). `FloorMap` measures `poi-` and `area-` shapes too and draws a `labels` layer under avatars and status cues (`data-label=<svg id>`), `fill-fg`/`fill-muted-fg` with a `stroke-card` halo (`paint-order: stroke`), which fixes the Phase 2 dark-mode contrast gap. `map-view` builds labels from `floor.areas` and non-desk `floor.spaces`, dimmed outside an open area. The seed drawings lost their 13 `<text>` labels (they still diff to "no changes"); `docs/map-authoring.md` now says not to draw names. **Existing deployments:** a drawing uploaded before this still has its own text, so names show twice until it's re-uploaded without them. The optional per-user "Show names on map" toggle wasn't built. Tests: 5 unit, 3 Playwright.
- [x] #16 Admin-named "floor" tier
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/floor-tier-label`
    - **Notes:** Per office, as confirmed with the project owner (2026-10-04). Migration `0010` (`location.floor_label_singular`/`_plural`, defaults Floor/Floors; not shared with #22). `core/spaces/tier.ts`: `TierLabels`, `DEFAULT_TIER_LABELS`, `TIER_PRESETS` (Floor, Building, Wing, Level, Zone), `tierLabel(labels, "singular" | "plural" | "lower" | "lowerPlural" | "whole")`. `locationFormSchema` takes both (trimmed, 1–30 characters, defaulted). `MapLocation.floorLabels`. Replaced: the map's floor group name, "Whole floor", the section and drawing labels, the overview column; the office list's column, "Add floor" and "No floors yet"; the new-floor heading; the floor page's "Floor details", buttons and "Floor drawing (SVG)". **Kept:** the admin nav and "Offices and floors" (not tied to one office), the seat picker's group label (it spans offices), and "No floor has a drawing yet" (no office in context). Tests: 7 unit, 2 Playwright.
- [x] #7 Bulk edit people
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/bulk-edit-people`
    - **Notes:** `core/people/bulk.ts`: `bulkPatchSchema` (`active`, `managerId` (null = default lead, #11), `addTeamIds`, `removeTeamIds`, `primaryTeamId`), `applyBulkPatch(form, patch)` (joins a new primary team; drops a removed primary; never swaps desks), `bulkUpdateInputSchema`. `savePerson` was split into a wrapper and `savePersonIn(tx, …)`; `bulkUpdatePeople(db, actor, ids, patch)` runs it per person in one transaction (all or nothing; errors prefixed with the person's name and "Nothing was changed."). UI: row checkboxes plus "Select everyone shown" (indeterminate when partial), selection limited to rows the filters show, `components/admin/bulk-action-bar.tsx` with a native `<dialog>` that lists the people before applying. Phone numbers stored before #13 aren't normalized by a bulk change (savePerson trusts its input; the action-level schema isn't re-run). Tests: 5 unit, 3 DB, 2 Playwright; 2 row locators moved to email, as row names now start with the checkbox label.
- [x] #20 Everyone can edit their own profile
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/self-profile`
    - **Notes:** `/profile` ("My profile" in the top bar), `selfProfileSchema` in `core/people/form.ts` (`preferredName`, `phone`, `homeTimezone`, `identities`; zod drops anything else), `findOwnProfile(db, email)` and `saveOwnProfile(db, email, input)` in `queries/people.ts` (phone normalized against the person's own `homeRegion`; blank time zone defaulted from the desk as in #19; `checkIdentitiesFree` is now shared with `savePersonIn`; returns what was stored so the form shows the normalized phone). Audit `actorEmail` is the person. **Open question settled with the note's recommendation:** no photo self-edit (no free URLs; wait for uploads or #3). §10 Authorization and §13 Q2 updated. Tests: 1 unit, 3 DB, 2 Playwright.
- [x] #21 Rename and create rooms and desks in the browser
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/rename-spaces` (step 1) and `feature/place-desks-rooms` (step 2)
    - **Step 1 notes:** "Room and area names" on `/admin/floors/[id]` (`components/admin/space-names.tsx`): areas, rooms and points of interest with inline names and a seat count for meeting rooms and phone booths. `spaceEditSchema`/`areaEditSchema` in `core/spaces/form.ts`; `listFloorSpacesForAdmin`, `saveSpace` (refuses desks: their name is their code) and `saveArea` in `queries/floors.ts`; audit entities `space` and `area`. Names are never overwritten by an upload (the diff keeps existing rows), so a re-upload keeps a rename; tested. Tests: 4 DB, 2 Playwright.
    - **Step 2 notes:** done 2026-10-04, merged from `feature/place-desks-rooms`. `core/svg/edit.ts` `editDrawing(svg, floorSlug, edit)` (server-only, jsdom) adds a desk (`desk-<floor>-<next>`), a room (`room-<slug>` via `slugFromName`, `-2`… if taken) or removes a desk or room; `core/svg/edit-input.ts` `drawingEditSchema` (jsdom-free). `previewDrawingEdit(db, floorId, base, edit)` applies it to `base` (or the current version), sanitizes, and plans it like an upload; applying is the existing `applyUploadAction`. New shapes go at the SVG root; area membership comes from the parser's bounding-box fallback (a transform on the area group doesn't matter). UI: `components/admin/drawing-editor.tsx` (tools Add a desk / Draw a room / Remove; desk size = the floor's most common desk box) in `FloorDrawingPanel`; `getFloorForAdmin` returns `currentSvg`. Rooms are rectangles only. Phase 6's click-to-place item marked done. Tests: 11 unit, 2 DB, 2 Playwright.
- [x] #22 Archive (or delete) rooms, floors and offices
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/archive-floors-offices`
    - **Notes:** Migration `0011` (`location.archived_at`). `queries/floors.ts`: `setFloorArchived`, `setLocationArchived` (archives the office's live floors at the same instant; unarchiving restores only floors whose `archivedAt` equals the office's, so a floor archived earlier stays archived), `deleteFloor`, `deleteLocation` (refused if any floor ever had an `svg_asset`; such a floor has no areas, spaces or room status, so no FK ordering is needed). Desk holders: `DesklessConfirmationNeeded` (a `ValidationError` carrying names) until `confirmDeskless`, then each person is made deskless with an audit entry. Archived offices are filtered in `loadMap` and `loadDirectory`'s office list; archived floors were already filtered everywhere. UI: `components/admin/archive-controls.tsx` on the floor and office pages; `/admin/locations?archived=1` shows archived ones, marked "(archived)". **Single rooms and desks** are removed through the drawing (#21's editor or an upload), as the note says. Tests: 3 DB, 2 Playwright.
- [x] #29 Encrypted JSON export and import of the organization
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/organization-backup`
    - **Notes:** `core/backup/crypto.ts` (server-only, imported by path): `encryptExport`/`decryptExport`, scrypt N=2¹⁵ r=8 p=1 (64 MB `maxmem`) → AES-256-GCM, file `{ format: "officeorg-export", version: 1, kdf, cipher: { iv, tag }, ciphertext }`; passphrase ≥ 12 characters; a crafted file can't ask for absurd scrypt costs. `queries/backup.ts`: sections in FK order (locations, floors, svgAssets, areas, spaces, teams, people, teamMembers, personIdentities, appUsers, brandAssets, themes), generic over drizzle column metadata (generated `person.name` skipped, timestamps revived, bytea as base64); `exportOrganization`, `exportOrganizationAudited`, `planImport` (per-section create/update/unchanged; merge conflicts on office/team slug, email, desk code, account), `applyImport` (one transaction; deferred self-references floor→svgAsset, team→parent/lead, person→manager set in a second pass; cycle checks; `syncInheritedMemberships`; roles from the file only with `applyRoles`; importing admin forced to admin; replace mode also clears room status, presence and messaging tokens). Audit entity `organization`, actions `export`/`import`. **Schema version** is the database's latest `drizzle.__drizzle_migrations.created_at`; **any other version is refused**: format v1 has no upgrade steps yet, so the first schema change after this must add them (or exports must be retaken). Web: `POST /api/admin/backup/export` and `/import` (route handlers, no server-action body limit), `/admin/backup` with "Backup" in the admin nav. `app_settings` don't exist yet, so aren't exported. README "Backup and moving instances"; §9 row. Tests: 4 unit, 5 DB (including a full replace round trip equal row for row), 2 Playwright.

**N. Second list (from the replaced `note.md`, 2026-10-04)**

Built after #21 step 2, #22 and #29, at the project owner's direction; #30 still goes last. Numbered N1–N10 to keep them apart from the original items.

- [ ] N1 Allow dual managers
    - **Decided (2026-10-04):** two **equal** managers, not primary + dotted line. The reporting structure stops being a tree: needs a `person_manager(personId, managerId)` table (or a second column), cycle checks over both edges, an org chart that can draw a person under two managers (d3-org-chart needs a single parent, so likely a duplicated node or a different layout), and decisions for #11's default-manager rule, the CSV (`manager_email` holding two emails), bulk edit and the person card. Needs a design pass before building.
- [x] N2 Directory and org chart use the full page width, with the person card floating over the content
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/full-width-layout` (with N3 and N4)
    - **Notes:** The `(app)` layout's `main` dropped `max-w-7xl` (Settings and Profile keep their own `max-w-xl`). `FloatingPanel` in `components/view-bar.tsx`: fixed at the right on `lg` (below the bar with `belowBar`), static below the content on narrow screens; the view pads its content with `FLOATING_PANEL_GUTTER` while a person is selected, so the card never covers a row or control. The "Select someone to see their card" placeholder is gone. **Interpretation:** the map keeps its right column, since it shows the office overview when nothing is selected. Checked with desktop screenshots.
- [x] N3 Keep the main menu at the top while scrolling
    - **Completed:** 2026-10-04 (`feature/full-width-layout`)
    - **Notes:** `sticky top-0 z-30 bg-bg` header; one `lg:h-14` row on wide screens, which the bar and panel offsets rely on. On narrow screens it can wrap, and the bar below it isn't sticky.
- [x] N4 Map and org chart filters in a secondary bar between the main menu and the content
    - **Completed:** 2026-10-04 (`feature/full-width-layout`)
    - **Notes:** `ViewBar` (`role="region"`, named "Map filters" / "Org chart filters"), full width under the menu, `lg:sticky lg:top-14`. Map: floors, areas, team highlight with its counts, Map/List. Org: tree, Chart/List, team highlight. The directory's filters stay in its header (the note named the map and org chart only).
- [x] N5 People and teams sorted alphabetically in every dropdown
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/sorted-dropdowns`
    - **Notes:** `sortByName` in `core/people/names.ts` (the lists' `Intl.Collator("en")`) applied at render in the org, directory and map team filters, the admin people team filter, the person form's manager select, the team form's parent and lead selects, and the bulk bar's manager/team select. Dropdowns sort by the shown full name (given name first); lists keep sorting by family name (#2). The no-README-change check: the README doesn't describe dropdown order. Tests: 1 unit, 1 Playwright.
- [x] N6 Final date (admin view only)
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/end-date`
    - **Notes:** A person's last working day, as decided (2026-10-04). Migration `0013` (`person.end_date`). `PersonRecord`/`PersonForm.endDate` ("Last day"; refused before the start date in the form and the CSV). CSV `end_date` after `start_date`. #12's `keepIdentities` became `ValidPersonRow.absentColumns` with `KEPT_IF_ABSENT` (account columns and `end_date`), so an older spreadsheet doesn't clear it. Admin list shows "Last day …" under the status, formatted with `formatDate` in UTC (a calendar date shouldn't shift by zone). `DirectoryPerson` never carries it; the e2e test checks the viewer's page HTML, including the server-component payload. It doesn't deactivate anyone on the day; that would need the worker. Tests: 2 unit, 1 Playwright.
- [x] N7 Flags as a standalone region display option
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/flag-only-display`
    - **Notes:** `REGION_DISPLAYS` gained `flag` ("Flag only"; migration `0012` adds the enum value). `formatRegion(code, "flag")` is the country name; `regionLabel` returns `flagOnly: true` with the flag and that name, or the bare code when there's no flag. `DirectoryPerson.homeRegionFlagOnly`, `MapLocation.regionFlagOnly`; `RegionText` in `location-label.tsx` renders the flag `aria-hidden` with the name in an `sr-only` span and a `title`. The #28 checkbox is irrelevant in this mode. **Also on this branch:** a fix to #22's archive spec, whose `name: "Archive floor"` matched "Unarchive floor" as a substring (the intermittent failure noted under N8). Tests: 5 unit, 1 Playwright.
- [x] N8 Don't draw area names on the map; use areas only to filter
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/no-area-labels`
    - **Notes:** `map-view` no longer builds area labels; `labelLayout(box, name)` lost its `kind` and area layout; `FloorMap` no longer measures `area-` shapes. Area buttons and dimming are unchanged. The map labels spec now checks areas have no label and dims by rooms. One full e2e run had an unidentified single failure that didn't recur in two more runs; if it shows up again, record which spec. Tests: 1 unit removed, 2 Playwright updated.
- [ ] N9 Assign a person to an office without a desk (a person → location link for remote-in-office or hot-desk staff; affects the map's office counts, the directory's office filter and #19's time zone default)
- [ ] N10 Seating planner: admins plan a seating chart by grouping (e.g. by team), lock individuals in place, and auto-regroup the rest (large; needs a design pass)

**G. Integrations (with Phases 4 and 5)**

- [!] #4–6 Provider-agnostic interfaces in `packages/integrations`
    - **Blocked:** built with Phases 4 and 5, which wait on the Phase 0 spikes (a Google Workspace service account and a Slack workspace). The schema half is done above.
    - **Design (from the note):** `MessagingProvider` (`matchUsers(emails)`, `listProfiles()` for #3, `personLink`/`channelLink` with web fallback, `openGroupChat(viewerToken, ids)`, `maxGroupSize`, `subscribeStatusChannel`/`history(since)`, `react(messageRef, emoji)`), `CalendarProvider` (`outOfOffice`, `workingLocation`), `RoomDirectory` + `RoomStatusSource` (`listRooms()`, `freeBusy(resourceIds, from, to)`), fakes for each. Selected by env: `MESSAGING_PROVIDER`, `CALENDAR_PROVIDER`, `ROOMS_PROVIDER`; `INTEGRATIONS=fake` sets them all. Providers declare capabilities (`supportsGroupChat`, `supportsReactions`) and the UI hides what's missing. Later targets: Microsoft Teams + M365 (Graph; chat deep links need no API call), Robin/Skedda/Envoy (room status only), Google Chat/Mattermost/Discord (spike each). Rewrite §3, §4, §8 and §10 around providers when this lands.
- [!] #3 Sync photo and title from the messaging tool
    - **Blocked:** needs #4's `MessagingProvider.listProfiles()`, so Phase 5; #2 is done
    - **Design (from the note):** wire `photoUrl` through `DirectoryPerson`, the card, the map overlay (`<image>` with a circular clip, falling back to initials) and org nodes (scheme-checked, through `escapeHtml`). A nightly `profiles:sync` job plus an admin "Sync now" with a diff (reuse `diffRecords` and the import dry-run UI). Per-field precedence (`person.title_source: manual | synced`; an admin edit flips it to manual). Proxy images same-origin (`/api/avatars/[personId]`) to keep CSP `img-src 'self'`. Open question: sync titles at all? Recommended: photos on by default, titles opt-in per deployment.

**H. Rebrand**

- [ ] #30 Rename the project from OfficeOrg to OrOv
    - **Depends on:** every other item; it touches nearly every file
    - **Design (from the note):** replace `OfficeOrg` → `OrOv` and `officeorg` → `orov` (and any `OFFICEORG_*` → `OROV_*`) across README, plan.md, docs, package names (`@orov/*`), `pnpm-workspace.yaml`, the Dockerfile, compose service and volume names, CI image and artifact names, `.env.example`, code comments and strings, and the database init script (`orov_dev`, `orov_test`, `orov_e2e`). Keep table names and type names. One commit with no logic changes. Acceptance: `pnpm install`, `pnpm dev` and the Docker build work with the new names; images tagged `orov-web` and `orov-worker`.

---

## 13. Risks and open questions

| #   | Item                                                                                   | Owner / default                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Slack keyword messages are free text, so parsing will be imperfect.                    | Mitigated by reaction feedback, the parsed-message log, and editable rules. Could later add a `/status` slash command for structured input.                      |
| R2  | Workspace admins may hesitate to grant domain-wide delegation.                         | Ask early with the scoped list in §8. If they refuse, rooms still work with one shared delegated calendar user, but Calendar presence would need per-user OAuth. |
| R3  | Showing health status (`sick`) to colleagues.                                          | **Open:** confirm with HR. Presence display is off by default. `simple` mode never shows a reason, and `detailed` mode masks sick as "Away" for viewers.                                                                                         |
| R4  | Floor drawings don't exist yet, or exist only as PDFs.                                 | **Open:** who draws them? Budget 0.5–1 day per floor in Figma.                                                                                                   |
| R5  | Spreadsheet data quality (duplicate names, missing managers).                          | The dry-run import surfaces every bad row before anything is written.                                                                                            |
| R6  | Brand palettes often fail WCAG AA, especially for status colors on the map. | The contrast gate in §9.1 blocks failing themes by default and suggests the nearest passing shade. Room status also has a non-color cue. |
| Q1  | Which Slack channel is the status channel, and is there one per office?                | Default: one channel, configured by env var. A per-location channel is a small extension.                                                                        |
| Q2  | Should people be able to edit their own profile (photo, phone) without being an admin? | **Resolved (Phase 7 #20):** yes, for preferred name, phone, home time zone and other accounts. Photos wait for uploads or the synced photo (#3), so no free photo URLs. |
| Q3  | Hosting target and network access (public with Google SSO, or behind VPN/IAP)?         | Socket Mode works for either.                                                                                                                                    |
| Q4  | Do deskless or remote people belong on the map at all?                                 | Default: no. They appear in the directory and org chart with a "{region} [Remote]" card, in the viewer's region format (§7.1).                                    |
| Q5  | Does the organization have an exported token file, or only a PDF brand guide? | Default: start from `theme/default.tokens.json` and set the slots directly in the Branding mapping editor. A token file isn't required. |
