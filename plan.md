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

The schema builds on the model in `report.md` and adds cache, audit, and integration tables. All ids are text (`p_…`, `t_…`; use `cuid2`) so they're safe to put in URLs.

```
location      (id, slug UNIQUE, name, timezone, region (ISO 3166 code), googleBuildingId?,
               sortOrder)
floor         (id, locationId, slug, name, level int, svgAssetId, sortOrder)
                UNIQUE(locationId, slug)
svg_asset     (id, floorId, version int, sanitizedSvg text, sha256, uploadedBy, uploadedAt)
area          (id, floorId, slug, name, svgElementId)          UNIQUE(floorId, svgElementId)
space         (id, floorId, areaId?, kind, svgElementId, name, capacity?,
               googleResourceEmail? UNIQUE, archivedAt?)
                kind: desk | meeting_room | phone_booth | kitchen | elevator | restroom | other
                UNIQUE(floorId, svgElementId)

person        (id, email UNIQUE, name, preferredName?, title?, photoUrl?, phone?,
               homeRegion (ISO 3166 code), homeTimezone?,
               managerId → person?, assignedDeskId → space? UNIQUE (partial, non-null),
               slackUserId? UNIQUE, startDate?, active bool, createdAt, updatedAt)
team          (id, slug UNIQUE, name, parentTeamId → team?, leadId → person?,
               slackChannelId?, color?)
team_member   (personId, teamId, isPrimary bool)   PK(personId, teamId)
                partial UNIQUE(personId) WHERE isPrimary

presence_signal (id, personId, date, status, source, sourceRef, note?, observedAt,
                 retractedAt?)
                 source: slack_message | gcal_ooo | gcal_working_location | manual
                 UNIQUE(source, sourceRef, date)   -- idempotent upserts
presence_day    (personId, date, status, winningSignalId?, PK(personId, date))  -- derived
presence_rule   (id, priority int, pattern text, matchType: keyword|regex,
                 status, dateScope: today|tomorrow|parse, enabled)

room_status     (spaceId PK, state: free|busy|soon, currentUntil?, nextStartsAt?,
                 checkedAt)

app_setting     (key PK, value jsonb, updatedBy, updatedAt)
                 key presence.display: off | simple | detailed   -- default off (§8.5)

slack_user_token (personId PK, encryptedToken, scopes, createdAt)   -- for group DMs
app_user        (email PK, role: viewer|admin,
                 regionDisplay: code|country|region|country_region   -- default country_region
                 lastSeenAt)
audit_log       (id, actorEmail, entity, entityId, action, before jsonb, after jsonb, at)
integration_run (id, job, startedAt, finishedAt?, ok bool, stats jsonb, error?)

theme         (id, version int, sourceFormat: dtcg|tokens_studio, sourceTokens jsonb,
               mapping jsonb, compiledCss text, sha256, active bool, createdBy, createdAt)
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
- An **overlay layer** draws avatars and, when presence display is on, the presence state from §8.5: badges in `detailed` mode, a greyed avatar and desk in `simple` mode, nothing in `off` mode. It's an absolutely positioned `<svg>` with the same viewBox, placed using `getBBox()` of each desk element, measured once after mount and cached per asset version.
- Clicking an element triggers event delegation on the root: read `target.closest('[id^=desk-],[id^=room-]')`, then update the URL.
- **Area view (U6):** with `area=south-wing` in the URL, call `zoomToElement('area-south-wing')` and add the `dim` class to everything outside that area.
- **Floor switcher** for the location's floors. The location overview page lists floors with headcount and free-room counts.
- **Accessibility:** offer a "List" toggle on the map that renders the same seats and rooms as a table, because an SVG map can't be navigated with a keyboard in any useful way.

---

## 7. Views and the selection model

### URL schema (the only selection state)

```
/{directory|map|org}?loc=sf&floor=2&area=south-wing&person=p_123&team=t_9&sub=1&multi=p_1,p_2
```

| Param                  | Effect                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `person`               | The focused person. Every view centers on them.                                                                              |
| `team`                 | The highlighted team. `sub=1` includes descendant teams (U2).                                                                |
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

- Labels are formatted **on the server** by `formatRegion` in `packages/core/regions/iso3166.ts`. Queries such as `loadDirectory(db, regionDisplay)` return the finished label next to the code, so the ISO 3166-2 list (about 5,000 rows) never reaches the browser. Client code must not import that module.
- Country names come from `Intl.DisplayNames`, so they use everyday names ("United States") and can follow a locale later. ICU has no subdivision names, so those come from the ISO 3166-2 list as published (local spellings such as "Karnātaka"). A nested subdivision such as `FR-75C` shows its own name ("Paris, France").
- A code that is no longer in ISO 3166 shows as the raw code, not as an error.
- Filters and URL state use codes, never labels, so a shared link works the same for every viewer.

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

- **Matching** (`slack:match-users`, nightly, plus an admin button with a diff): call `users.lookupByEmail` for each person without a `slackUserId`. Unmatched people show up in an admin list for manual entry.
- **1:1 chat:** a link to `slack://user?team=T&id=U`, with `https://app.slack.com/client/T/U` as the fallback. This needs no API call.
- **Team chat:** `slack://channel?team=T&id=C` from `team.slackChannelId`.
- **Group DM (2–8 others):**
    1. If the viewer has no `slack_user_token`, the first click sends them through **Connect Slack** (an OAuth v2 user flow with the user scopes `im:write` and `mpim:write`). The token is stored encrypted with AES-256-GCM using `TOKEN_ENC_KEY`.
    2. `POST /api/slack/group-dm {personIds}` calls `conversations.open users=…` as the viewer and returns the channel id. The browser then navigates to the `slack://channel` deep link.
    3. Slack caps a group DM at 9 people including the viewer. Enforce that in the selection tray.

---

## 9. Admin

| Page                   | Capabilities                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Import**             | Upload a CSV for people, teams, or memberships. The people file's `home_region` column takes an ISO 3166 code (`US` or `US-CA`); files that still use the older `home_country` header import unchanged. Each row is validated with zod, then the admin sees a dry-run diff (create/update/error per row) and applies it. Managers are resolved by email in a second pass so the file order doesn't matter. |
| **People / Teams**     | CRUD with cycle-safe manager and parent pickers, desk assignment through a seat picker (a mini map), team membership, and a primary-team flag.                                                                                                     |
| **Locations / Floors** | CRUD (each location has an ISO 3166 `region` code, validated like `home_region`), SVG upload with the diff from §6, and version history with rollback.                                                                                                                                                                         |
| **Rooms**              | Google import diff, room ↔ svg id linking, and capacity overrides.                                                                                                                                                                                 |
| **Presence**           | The display mode selector (`off` / `simple` / `detailed`, default `off`, §8.5) with a preview of each mode, and "Delete presence data". Below that, CRUD for rules, a "test this message" box, and the parsed-message log from §8.3.                                                                                                                                                                   |
| **Integrations**       | The last run, status, and stats for each job from `integration_run`, with "run now" buttons. Unmatched Slack users are listed here.                                                                                                                |
| **Branding**           | Upload a tokens file, edit the token → slot mapping, see a live preview of the directory, map, and org chart with the draft theme, read the contrast report, upload logos and fonts, and roll back to an earlier theme version. Export the active theme as DTCG JSON (§9.1). |
| **Audit log**          | Every admin write is recorded with before and after JSON. Filterable.                                                                                                                                                                              |
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

**Serving.** `globals.css` uses Tailwind v4 `@theme inline` to point utilities at the slot variables (for example `--color-primary: var(--primary)`), with the defaults from `slots.ts`. The root layout links `/theme.css`, which returns the active theme's `compiledCss` with an ETag and a long cache keyed by the theme version. It's a stylesheet rather than an inline `<style>`, so it fits the CSP in §10. When no `theme` row exists, the route serves the theme compiled from `theme/default.tokens.json`, or from the file named by the `THEME_TOKENS_PATH` env var.

**Fonts and logos.** `next/font` works only at build time, so runtime brand fonts are uploaded WOFF2 files stored as `brand_asset` rows, served same-origin from `/api/brand-assets/[id]`, and declared with generated `@font-face`. SVG logos go through the same sanitize step as floor SVGs (§6). `appName` and the favicon feed Next.js `generateMetadata`.

**Later (Phase 6).** Live sync from the Figma Variables REST API (Enterprise plans only) or the Penpot API, and per-location theme overrides. File upload covers every tool in v1.

---

## 10. Security and operations

- **Authentication:** every route except `/api/auth/*`, `/login` and `/dev/sign-in` (404 outside local development) is protected by the proxy. The domain check (and Google's `hd` check) runs in the Auth.js `signIn` callback, not just in the client prompt hint. Development sign-in methods are not registered in a production build, and `canSignIn` rejects them again if they were.
- **Authorization:** `viewer` can read everything except presence reasons (§8.4). `admin` can write. Every user can change their own settings (§7.1), and nothing else. Presence is also gated by the display mode (§8.5): `off` exposes nothing, and `simple` exposes only an away flag, to every role.
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
    - **Notes:** Teams import before people. A people row is the person's full state (a blank cell clears a field); people missing from the file are left alone. Imports are all-or-nothing and re-planned inside the write transaction. Exports re-import with no changes (tested). Team leads are not in the CSV and are set in the admin UI. The memberships CSV from §9 is folded into the people file (`teams`, `primary_team` columns).
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

**Phase status:** in progress on `phase/5.5-branding` (started 2026-10-03), ahead of Phases 4 and 5 at the user's direction, since it depends only on Phase 1's token layer.

- [x] `docs/theming.md` and `theme/default.tokens.json`
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/theme-docs-defaults`
    - **Notes:** `theme/default.tokens.json` is **generated** from `slots.ts` by `pnpm theme:defaults` (alongside `theme-defaults.css`) through the DTCG exporter, and CI's drift check now covers both files; it's in `.prettierignore` so a formatter can't break the check. Edit `slots.ts`, never the file. Token paths are the slot names and dark values are in `$extensions.mode`, so the file is also the reference example of a complete theme. An organization's own deploy-time default goes through `THEME_TOKENS_PATH` (item 3), not by editing this file. `docs/theming.md` is for designers and admins: export steps per tool, sets and modes, references, the slot reference, the value grammar, mapping suggestions, dark mode and the contrast rules. Its sections on the Branding page, uploads and `THEME_TOKENS_PATH` are added with the features that build them; until then a status note says the page is still being built. A unit test fails if a slot is missing from the guide.
- [x] Token parse, alias and mode resolution, slot mapping, and validation in `packages/core/theme`
    - **Completed:** 2026-10-03
    - **Branch:** merged from `feature/theme-core`
    - **Notes:** Pure modules: `parse.ts` (DTCG and legacy Tokens Studio, either syntax in a multi-set file marked by `$themes`/`$metadata`; a single DTCG file is one set named after the file), `resolve.ts` (aliases per mode), `map.ts` (suggestions and `applyMapping`), `validate.ts` (zod-based value grammar), `contrast.ts`, `emit-css.ts`, plus `color.ts`, `values.ts`, `export.ts` (DTCG export) and `build.ts` (the whole pipeline in one call, used by preview and apply). **Modes:** a set whose name contains the word "dark" or "light" applies only in that mode, other sets are a base for both, and a token's `$extensions.mode: {light, dark}` (Terrazzo's convention) wins over both. `$themes` itself is not read. **Errors vs. warnings:** circular and missing references, bad JSON and values that fail the grammar are errors and block applying. Tokens Studio math (`{space.1} * 2`), composite types (typography, shadow) and names containing `.` or braces are skipped with a warning, so an unrelated token can't block an import. A mapped token that disappears on re-import falls back to the default with a warning. **Dark mode is an explicit switch** on the theme (`darkMode`): off means light-only (`color-scheme: light`, no dark block). With it on, a slot mapped to a single-mode token uses that value in both modes, and an unmapped slot keeps its default dark value. **Contrast:** 4.5:1 for the `*-fg` pairs and `destructive` on `bg`. 3:1 (WCAG non-text contrast) for room and presence colors on `map.bg` and `card`. Room free/busy/soon must stay ΔE<sub>OK</sub> ≥ 0.06 apart under protanopia, deuteranopia and tritanopia (Machado 2009 simulation). A failure suggests the nearest passing shade (OKLab lightness, hue kept). **Default palette changed to pass its own gate:** light `room.busy` `#dc2626` → `#b91c1c` (red and green were ΔE 0.05 apart for deuteranopes) and light `room.stale` `#9ca3af` → `#6b7280` (2.4:1). `font.mono`'s default is now in canonical quoted form. `defaultThemeCss` moved from `slots.ts` to `emit-css.ts`, so the bundled defaults and imported themes share one emitter. **Fixtures are hand-written** from the published Figma, Tokens Studio and Penpot formats, because the Phase 0 design tokens spike hasn't run. Replace them with real exports when it does. Tests: 87 more unit tests (321 in core).
- [ ] `theme` and `brand_asset` tables, `/theme.css` route, `/api/brand-assets/[id]`
- [ ] Admin Branding page: upload, mapping editor, contrast report, live preview, logo and font upload, versions and rollback, DTCG export
- [ ] Map and presence colors switched to slot variables, plus the non-color room status cue

### Phase 6: Polish (ongoing)

- [ ] Mobile layout: map as full-screen sheet, directory first
- [ ] Click-to-place seat editor in the app, so new desks don't need a Figma round-trip
- [ ] "Who's in today" dashboard per location (shown only when presence display is on, §8.5)
- [ ] Optional HRIS sync, which replaces CSV as the people source
- [ ] Live theme sync from the Figma Variables REST API (Enterprise plans only) or the Penpot API
- [ ] Per-location theme overrides
- [ ] Searchable ISO 3166 region picker in the admin person and location forms, in place of the free-text code
- [ ] A UI locale setting (§7.1), so country names in region labels follow the user's language

**Total: about 7.5–9 weeks for one engineer, or about 4.5–5.5 weeks for two.** Two engineers can split phases 2 and 3, and phases 4 and 5, in parallel. Phase 5.5 depends only on Phase 1's token layer, so it can run alongside any later phase.

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
| Q2  | Should people be able to edit their own profile (photo, phone) without being an admin? | Default: no in v1. Self-edit is a small Phase 6 item.                                                                                                            |
| Q3  | Hosting target and network access (public with Google SSO, or behind VPN/IAP)?         | Socket Mode works for either.                                                                                                                                    |
| Q4  | Do deskless or remote people belong on the map at all?                                 | Default: no. They appear in the directory and org chart with a "{region} [Remote]" card, in the viewer's region format (§7.1).                                    |
| Q5  | Does the organization have an exported token file, or only a PDF brand guide? | Default: start from `theme/default.tokens.json` and set the slots directly in the Branding mapping editor. A token file isn't required. |
