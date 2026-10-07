# OrOv: Implementation Plan

> **How to read this file.** Sections 1–11 are the design: goals, architecture, data model, and how each part works. Where the built code departs from them, the progress notes in §12 say so, and the notes win. Section 12 is the delivery plan and the progress log, one entry per feature, in the format described in [`CONTRIBUTING.md`](CONTRIBUTING.md). For the system as it is built today, start with [`docs/architecture.md`](docs/architecture.md); for integrations, [`docs/integrations/`](docs/integrations/README.md).

OrOv is an internal web app with four parts: a floor map, a people directory, an org chart, and optional live presence (off by default, §8.5). It can also show meeting-room status from a room provider and offer shortcuts into the organization's chat tool (§8). It covers 1–3 offices and fewer than 250 people.

The plan began as the build option of an internal buy-versus-build evaluation, which isn't part of this repository. One requirement from it shapes §8: **WFH and sick status come from keyword messages in a status channel** that people already post in, not from chat profile status emoji.

---

## 1. Goals, non-goals, user stories

### Goals

- The tool is the **source of truth** for people, teams, reporting lines, and seat assignments. Those currently live in spreadsheets.
- It provides one linked view: person ↔ seat ↔ team ↔ manager ↔ presence ↔ chat.
- All integrations are read-only, except the group chat the viewer starts. No chat, calendar or room-booking vendor is assumed: each is a provider chosen per deployment (§8).
- The app can be restyled to an organization's brand guidelines (colors, fonts, logo, sizing, spacing, density) **without code changes**, by importing design tokens exported from Figma, Penpot, or Tokens Studio (§9.1).

### Non-goals (v1)

- Room or desk **booking**, hot-desking, kiosks, or room panels. Use a dedicated booking product if these are needed; OrOv can show its room status through a room provider (§8.1).
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
| U7  | In the organization's chat tool, chat with one person, start a group chat with several people (up to the tool's limit), or open a team's channel | all       |
| U8  | When an admin has turned presence display on: in **simple** mode, see who isn't in today because they're greyed out. In **detailed** mode, see who is on vacation, sick, or WFH, with a badge on their desk and a pill in the directory. With display **off** (the default), no presence appears anywhere | all       |
| U9  | Switch between directory, map, and org chart without losing the selected person or team                   | all       |
| U10 | An admin imports the existing spreadsheets, then edits people, teams, and seats in the app                | admin     |
| U11 | An admin uploads a new floor SVG and sees a diff of added, removed, and orphaned seats before applying it | admin     |
| U12 | An admin imports the brand's design tokens, maps them, previews them, and applies them. The directory, map, and org chart pick up the new colors, fonts, logo, and density | admin |
| U13 | In their own settings, a user chooses how locations appear: the **ISO 3166 code** (`US-CA`), the **country name** (United States), the **region name** (California), or the **region and country name** (California, United States). Other users are unaffected | settings, all |

---

## 2. Integration spikes

A spike is a short throwaway script (in `spikes/`, not shipped) that checks an assumption a later phase depends on, against the real tool, before that phase is built. If a spike fails, rework the phase first. Run one per capability for each tool being considered, once someone has access to it. The questions are the same whatever the tool; [`docs/integrations/provider-notes.md`](docs/integrations/provider-notes.md) has what is already known about specific tools.

| Spike                  | What it must show                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Room status**        | The tool lists rooms with stable ids (and, ideally, building, floor and section), or the admin can find each room's id by hand. Busy times for 2–3 rooms match the tool's own UI. The read-only access needed is acceptable to the tool's administrator. |
| **Calendar presence**  | For 3–5 volunteers, out-of-office events come back, and where the tool has working locations, home is distinguishable from office. Reading other people's calendars is possible with access the administrator will grant. |
| **Status channel**     | A bot can read a channel's history and, ideally, receive new, edited and deleted messages without a public URL. Pull 60 days of a real channel to collect the phrasings that seed the keyword rules (§8.3), and a rough share of messages that are unambiguous. |
| **Chat**               | Staff emails match the tool's accounts (aim for more than 95%). Links open a person and a channel in the desktop and mobile clients. Opening a group chat works as the viewer, and its size limit is known. |
| **Design tokens**      | Real token files exported from Figma (via Tokens Studio or the Variables export available on the org's plan) and from Penpot's design tokens panel resolve their aliases and light/dark modes to concrete values. Record the exported field names and quirks, so the parser fixtures match reality. |

Write each spike's outcome, with sample payloads and the scopes that turned out to be needed, under the tool's heading in `docs/integrations/provider-notes.md`.

---

## 3. Architecture

```
┌──────────────────────────── one repo (pnpm workspace) ─────────────────────────────┐
│                                                                                    │
│  apps/web  (Next.js App Router)            apps/worker  (Node, long-running)       │
│  ─ UI: /directory /map /org /admin         ─ pg-boss scheduled jobs:               │
│  ─ Route handlers: /api/*                    · rooms:status              every 60s │
│  ─ Server actions for admin writes           · presence:calendar         hourly    │
│  ─ Auth.js (pluggable SSO, domain-restricted) · presence:messages-backfill  15 min │
│  ─ Reads cached integration data only        · messaging:match-users     nightly   │
│                                             ─ live status-channel listener, when   │
│                                               the messaging provider offers one    │
│                        \                        /                                  │
│                         └── packages/db (Drizzle schema + queries) ──┐             │
│                             packages/core (pure domain logic)        │             │
│                             packages/integrations (provider interfaces, registry,  │
│                               fakes, contract tests; adapters in providers/<id>/)  │
└──────────────────────────────────────────────────────────────────────┼─────────────┘
                                                                       ▼
                                                                  Postgres 16
```

### Key decisions

| Decision        | Choice                                                                                       | Why                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js (App Router) + TypeScript, strict mode                                               | Required stack.                                                                                                                                                                     |
| DB / ORM        | Postgres 16 + **Drizzle** (with drizzle-kit migrations)                                      | SQL-shaped queries suit recursive CTEs (team trees, org chains), and the schema stays in TypeScript.                                                                                |
| Background work | A separate **worker process**, scheduled with **pg-boss**                                    | Next.js has no reliable in-process scheduler. pg-boss stores its queue in Postgres, so you don't need Redis. A live status-channel listener needs a persistent connection anyway.                |
| Live events     | An **outbound connection** from the worker, where the messaging provider offers one; otherwise a webhook route in the web app | No public URL is needed, so the web app can sit behind a VPN or IAP. A provider that only offers webhooks needs a public route that verifies each request's signature. |
| Auth            | **Better Auth** (Phase 8; Auth.js before it, now in maintenance mode) with the SSO providers listed in `AUTH_PROVIDERS`: `google` (built in), `microsoft-entra-id`, `okta`, `cognito`, or any `oidc` issuer (generic OAuth). Sessions are database rows (`auth_session`), so sign-out and demotion are immediate. Reject sign-in unless the email is on `COMPANY_DOMAIN` (`canSignIn` in `user.validateUserInfo`, then `admitSession` before every session); Google also needs `hd === COMPANY_DOMAIN` and `email_verified`, and Entra needs a tenant-specific issuer. Local development can add a shared-password login (`AUTH_DEV_PASSWORD`) and an automatic sign-in (`AUTH_DEV_BYPASS_EMAIL`), as a server-only Better Auth plugin; both are ignored unless running `next dev` on a localhost `AUTH_URL`. | Single sign-on with whichever identity provider the organization already uses, on an actively maintained library. Roles live in the DB (`viewer` by default, `admin` bootstrapped from the `ADMIN_EMAILS` env var). |
| Integrations    | **Provider interfaces** in `packages/integrations`, chosen per capability by env (`MESSAGING_PROVIDER`, `CALENDAR_PROVIDER`, `ROOMS_PROVIDER`) | Each organization uses different tools, and may mix vendors across capabilities. The rest of the app depends only on the interfaces and their capability flags. |
| URL state       | **nuqs** (type-safe search params)                                                           | The selection lives in the URL (§7), and nuqs gives typed parsers and shallow updates.                                                                                              |
| Map             | Inline sanitized SVG + **react-zoom-pan-pinch**                                              | Zooming to an area is a `zoomToElement` call. No canvas or WebGL is needed at this scale.                                                                                           |
| Org chart       | **d3-org-chart** (MIT), wrapped in a client component                                        | Expand/collapse, `setCentered`, and `setHighlighted` cover U3 and U9 out of the box. Fall back to React Flow + elkjs only if heavy customization is needed.                         |
| UI kit          | Tailwind v4 + shadcn/ui, **styled only through semantic CSS variables**; TanStack Table for the directory | Fast, accessible, no design system to build. Components never use raw palette classes (`bg-white`, `text-neutral-900`), so a brand theme can restyle everything (§9.1). |
| Theming         | **W3C DTCG design tokens** → mapped onto a fixed set of semantic slots → CSS custom properties served at `/theme.css` | DTCG is the vendor-neutral format that Figma (through plugins or export), Penpot, and Tokens Studio all produce. Runtime CSS variables mean a brand change needs no rebuild, and shadcn/ui already uses the same variable model. |
| Validation      | **zod** at every boundary (CSV rows, API input, integration payloads)                        | Bad spreadsheet data is the main risk in the first two weeks.                                                                                                                       |
| Tests           | Vitest (core + db against a real Postgres via testcontainers), Playwright (end-to-end)       | See §11.                                                                                                                                                                            |

### Integration provider rule

Everything external goes behind an interface in `packages/integrations`: `MessagingProvider`, `CalendarProvider` and `RoomProvider`. For example:

```ts
interface RoomProvider {
	readonly capabilities: { directory: boolean };
	freeBusy(resourceIds: string[], from: Date, to: Date): Promise<Map<string, BusyBlock[]>>;
	listRooms?(): Promise<RoomResource[]>;
}
```

Each capability is chosen per deployment by env and defaults to `none`. `INTEGRATIONS=fake` selects in-memory fakes, which tests and local development use, so the whole app runs offline. A vendor's adapter lives in `packages/integrations/providers/<id>/` and must pass its capability's contract suite. Adapters report facts (an event, a busy block, a message); `packages/core` decides what they mean. The full design and the checklist for adding a provider are in [`docs/integrations/README.md`](docs/integrations/README.md).

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
      api/{rooms/status,presence,search,chat/connect/*,chat/group,brand-assets/[id]}/route.ts
      theme.css/route.ts          -- active theme as a cached stylesheet (§9.1)
    components/{map,org,directory,selection,admin}/
    lib/{auth.ts,url-state.ts,permissions.ts}
  worker/
    src/{index.ts,jobs/*.ts,listener.ts}
packages/
  db/        schema.ts, migrations/, queries/{people,teams,spaces,presence}.ts, seed.ts
  core/      presence/{rules.ts,resolve.ts}, svg/{parse.ts,sanitize.ts,diff.ts},
             teams/tree.ts, csv/{people.ts,teams.ts},
             regions/iso3166.ts,
             theme/{slots.ts,parse.ts,resolve.ts,map.ts,validate.ts,contrast.ts,emit-css.ts}
  integrations/ types.ts, {messaging,calendar,rooms}.ts, registry.ts, fakes/, contract/,
             providers/<id>/            -- one folder per real adapter (none yet)
theme/ default.tokens.json         -- deploy-time default theme (DTCG)
spikes/
docs/ architecture.md, configuration.md, adapting.md, map-authoring.md, theming.md,
      integrations/{README.md,provider-notes.md}, runbook.md
e2e/  Playwright specs per user story
```

---

## 5. Data model

The schema covers the organization (offices, floors, people, teams) plus cache, audit, and integration tables. All ids are text (`p_…`, `t_…`; use `cuid2`) so they're safe to put in URLs. Integration columns are vendor-neutral (Phase 7 #4–6): no column, enum value or CSV header names a vendor, so any provider fits without a schema change.

```
location      (id, slug UNIQUE, name, timezone, region (ISO 3166 code), externalBuildingId?,
               sortOrder, floorLabelSingular, floorLabelPlural,   -- default Floor/Floors (#16)
               archivedAt?,                                       -- archives its floors too (#22)
               mapTheme? jsonb)                                   -- office's own map slots (Phase 6)
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
               assignedDeskId → space? UNIQUE (partial, non-null),
               officeId → location? (only without a desk, N9),
               startDate?, endDate? (last day, admin-only, N6), active bool, createdAt, updatedAt)
team          (id, slug UNIQUE, name, parentTeamId → team?, leadId → person?,
               chatChannelId?, color?)
person_manager (personId, managerId → person, position)   PK(personId, managerId)
               -- any number of equal managers per person (Phase 7 N1; was person.managerId)
team_member   (personId, teamId, isPrimary bool, source: explicit | inherited)
                PK(personId, teamId), partial UNIQUE(personId) WHERE isPrimary
                inherited: derived from an explicit membership of a sub-team (Phase 7 #23)
person_identity (personId → person ON DELETE CASCADE, provider, value)
                PK(personId, provider), UNIQUE(provider, value)
                provider: github | gitlab | linkedin | website (profile, admin-edited)
                          | the messaging provider's id (user ids, written by the match job)

presence_signal (id, personId, date, status, source, provider, sourceRef, note?, observedAt,
                 retractedAt?)
                 source: message | calendar_ooo | calendar_working_location | manual
                 provider: the messaging or calendar provider's id | manual
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
                 locale text   -- default en; language for country names (Phase 6)
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

- **No cycles** through any of a person's managers (`person_manager`) or in `team.parentTeamId`. Check with a recursive CTE inside the same transaction as the write, and reject the write if it would create a cycle.
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

**Language** (`app_user.locale`, Phase 6): the language country names are shown in, from `UI_LOCALES` in `packages/core/regions/locales.ts` (default English). It's part of `RegionFormat`, so every label `regionLabel` builds follows it, and the region picker searches in it as well as in English. Subdivision names stay as ISO 3166-2 publishes them, so German reads "California, Vereinigte Staaten". The rest of the interface is English.

**Date format** (`app_user.dateFormat`, Phase 7 #27): `iso` (default, `2026-10-04 14:30`), `dmy` (`04/10/2026 14:30`) or `mdy` (`10/04/2026 2:30 PM`), formatted on the server by `formatDateTime` in `packages/core/dates/format.ts`. Times are shown in the viewer's home time zone if they have a person row, else their browser's (a `tz` cookie), else UTC, and timestamps carry the zone's abbreviation. Date filters (the audit log's) are read in the same zone. CSV files always use ISO 8601 in UTC.

---

## 8. Integrations

Three capabilities, each served by a provider chosen per deployment: **rooms** (§8.1), **calendar** (§8.2) and **messaging** (§8.3, §8.6). Each defaults to `none`, which hides the feature. The interfaces, data-flow rules, job list and the checklist for adding a provider are in [`docs/integrations/README.md`](docs/integrations/README.md); what is known about specific tools is in [`provider-notes.md`](docs/integrations/provider-notes.md). This section describes the behaviour every provider shares.

### 8.1 Room status (U5)

- **Import** (an admin button that shows a diff, when the provider has `capabilities.directory`): `RoomProvider.listRooms()`. Match rooms to `location` by `buildingId` (`location.externalBuildingId`), to `floor` by `floorName`, and to `area` by `section`. Then the admin links each room to its `room-*` svg id with a dropdown of unlinked ids, pre-filled by fuzzy name matching. Without a directory, the admin enters each room's resource id by hand. Either way the id is stored in `space.calendarResourceId`.
- **Worker `rooms:status` (every 60s, 08:00–19:00 in each location's timezone; every 10 min otherwise):** `RoomProvider.freeBusy` in batches of `maxResourcesPerCall`, for the window from now to the end of the day. A pure `deriveRoomState(blocks, now)` in `packages/core/map/room-status.ts` gives `free` / `busy` / `soon` (free now, booked within 15 min), and the job upserts `room_status`. A room the provider doesn't know is skipped, not an error.
- **UI:** `/api/rooms/status?floor=…` returns a small JSON map, which SWR polls every 30s. Server-sent events aren't worth the complexity at this scale. If `checkedAt` is more than 5 min old, show rooms grey with a "status stale" note rather than wrong colors. The free, busy, soon, and stale colors come from the `room.*` theme slots (§9.1).
- **Access:** read-only access to room calendars or bookings. Record the exact scopes each provider needed in its setup guide.

### 8.2 Presence from the calendar (U8)

- **Worker `presence:calendar` (hourly, plus once at 07:00 local time):** for each active person, `CalendarProvider.presenceEvents(email, today, today+7)`. The provider returns facts only; core maps them:
    - `out_of_office` → `vacation` (or `ooo` if the event title doesn't look like vacation; the keyword list is configurable)
    - `working_location` `home` → `wfh`, `office` → `in_office`, `other` → leave unset
- Upsert into `presence_signal` with `source` `calendar_ooo` or `calendar_working_location`, `provider` = the calendar provider's id, and `sourceRef` = the event's `ref`. Mark signals whose events have disappeared as `retractedAt`.
- Like the status channel (§8.3), this job is a no-op while `presence.display` is `off`.
- **Access:** read-only access to people's calendars, which usually means organization-wide (delegated or application) access that the tool's administrator must grant (§13 R2). With fewer than 250 users, one call per person per hour is far under any quota seen so far.

### 8.3 Presence from status-channel messages (U8)

This is the requirement: people post in a channel in the chat tool, for example `#office-status`, and keywords mean WFH or sick. This channel is the main source for the presence display modes in §8.5. It needs a messaging provider with `capabilities.statusHistory` (and, ideally, `liveEvents`). While `presence.display` is `off`, the listener and backfill skip the channel entirely: no signals are stored and no reactions are added. The messaging provider still serves identity and chat (§8.6).

- **Live** (when the provider has `liveEvents`): `MessagingProvider.listen` on the configured status channel delivers new, edited and deleted messages (which create, update or retract the signal). Thread replies are ignored unless a setting turns them on.
- **Backfill** (on worker start, then every 15 min): `statusHistory` for the last 48 h, because a live connection can drop events while the worker is down. Without `liveEvents`, backfill alone gives presence a delay of up to 15 minutes. Upserts are idempotent through `UNIQUE(provider, source, sourceRef, date)`, where `sourceRef` is the message's `ref`.
- **Parsing** (`packages/core/presence/rules.ts`, a pure function with heavy tests):
    1. Normalize the text: lowercase, turn emoji (Unicode or the tool's `:name:` codes, which the adapter passes through as text) into tokens, and collapse whitespace.
    2. Evaluate the enabled `presence_rule` rows by priority. Seed them from the spike, for example `wfh|working from home|remote today` → `wfh` and `sick|unwell|out sick|🤒` → `sick`.
    3. Resolve the date scope. The default is **today in the poster's location timezone**. "tomorrow" means +1 day. In v1, `parse` handles only `mon`–`fri` and `until <weekday>` (a range). Don't build a general date parser for v1.
    4. Treat negations ("not sick anymore", "back in office") as their own higher-priority rules that map to `in_office` and override earlier signals that day.
- **Feedback loop** (when the provider has `reactions`): when a message matches, the worker reacts with a Unicode emoji (for example 🏠 or 🤒) so the poster knows it was understood. When nothing matches, it does nothing. This is the cheapest way to keep the rule table honest.
- An admin page shows **the last 7 days of messages, how each was parsed, and the rule that matched**, so the rules can be tuned against real data.
- **Access:** read the status channel, read users' emails, and add reactions. Nothing else.

### 8.4 Presence resolution

`packages/core/presence/resolve.ts` is a pure function:

```
resolve(signals for person+date) → status
precedence: sick > vacation > ooo > wfh > in_office > unknown
tie within same status: latest observedAt wins
an explicit "back in office" status message on a date overrides wfh signals from the calendar that day
```

`presence_day` is recomputed for the affected (person, date) pairs whenever a signal changes. With no signals, the status is `unknown`, and the UI shows no badge rather than claiming the person is in the office.

**Privacy:** `sick` is health information. By default, viewers see **"Away"** for both sick and vacation, and only admins (and the person themself) see the specific reason. This is a setting to confirm with the people team (§13). Presence pills and desk badges take their colors from the `presence.*` theme slots (§9.1).

### 8.5 Presence display modes (U8)

Presence display is **off by default**. An admin chooses the mode on the Presence admin page (§9). The choice is stored as `app_setting` `presence.display` and recorded in the audit log.

| Mode                 | What viewers see                                                                                                                                                                                                                                                                                                         | Data collected                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `off` (default)      | No presence anywhere: no pills, badges, greying, or presence filter. The "Who's in today" dashboard (Phase 6) is hidden. People appear exactly as they do before Phases 4–5.                                                                                                                                              | None. The presence jobs and listener are no-ops |
| `simple`             | Anyone whose resolved status is anything other than `in_office` or `unknown` is **greyed out**: their directory row, person card, org chart node, and map desk and avatar are rendered at `presence.absent-opacity`. **No reason is shown to anyone**, admins included. Each greyed element also carries the text "Not in today" (a tooltip plus a visually hidden label) so the state isn't conveyed by opacity alone. | Same as `detailed`                              |
| `detailed`           | The status pills and desk badges from U8, with the sick and vacation masking from §8.4.                                                                                                                                                                                                                            | Status channel (§8.3) and calendar (§8.2)       |

- `unknown` is never greyed. With no signal, the app makes no claim either way, which matches the no-badge rule in §8.4.
- The mode is resolved **on the server**. `/api/presence` and the server components read `presence.display` first. In `off` mode they return no presence fields. In `simple` mode they return only a boolean `away` per person, never the status, so the reason can't be read from the network tab.
- Turning display on from `off` triggers one status-channel backfill run (48 h) and one calendar run, so today's state is filled in without waiting for the next schedule. Turning it off stops ingestion and hides display immediately. Existing signals age out through the normal 90-day retention (§10), and an admin can purge them early with a "Delete presence data" button.
- A `usePresenceDisplay()` hook (from a server-provided context) is the only way components learn the mode, so every view switches together.

### 8.6 Messaging: identity and chat (U7)

- **Matching** (`messaging:match-users`, nightly, plus an admin button with a diff): `MessagingProvider.matchUsers` for each person without a `person_identity` row for the messaging provider. Unmatched people show up in an admin list for manual entry, validated by the provider's `normalizeUserId`.
- **1:1 and team chat:** `personLink(userId)` and `channelLink(team.chatChannelId)`, built by the adapter without an API call. Each has an `https` web link and, where the tool has one, an app deep link tried first. Buttons appear only when a link exists.
- **Group chat (when `capabilities.groupChat`):**
    1. If the tool needs to act as the viewer and the viewer has no `messaging_user_token` row for the provider, the first click sends them through **Connect** (the tool's OAuth user flow, with only the scopes group chats need). The token is stored encrypted with AES-256-GCM using `TOKEN_ENC_KEY`.
    2. `POST /api/chat/group {personIds}` calls `openGroupChat` as the viewer and returns a link, which the browser opens.
    3. The selection tray enforces the provider's `maxGroupSize`.

---

## 9. Admin

| Page                   | Capabilities                                                                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Import**             | Upload a CSV for people, teams, or memberships. The people file's `home_region` column takes an ISO 3166 code (`US` or `US-CA`); files that still use the older `home_country` header import unchanged. Each row is validated with zod, then the admin sees a dry-run diff (create/update/error per row) and applies it. Rows can be skipped (one by one, or every row with an error); a row that depends on a skipped one (its manager, the other half of a desk swap, its parent team) becomes an error too, and Apply writes exactly what the dry run showed (Phase 7 #1). Managers are resolved by email in a second pass so the file order doesn't matter. |
| **People / Teams**     | CRUD with cycle-safe manager and parent pickers, desk assignment through a seat picker (a mini map), team membership, and a primary-team flag.                                                                                                     |
| **Locations / Floors** | Create, edit, and archive or delete (Phase 7 #22: archive hides an office or floor everywhere and keeps its history, after the admin confirms who loses a desk; only an office or floor that never had a drawing can be deleted). Each location has an ISO 3166 `region` code, validated like `home_region`), SVG upload with the diff from §6, version history with rollback, and the office's own map colors (Phase 6, §9.1).                                                                                                                                                                         |
| **Rooms**              | Room import diff (when the room provider has a directory), room ↔ svg id linking, and capacity overrides.                                                                                                                                                                                 |
| **Presence**           | The display mode selector (`off` / `simple` / `detailed`, default `off`, §8.5) with a preview of each mode, and "Delete presence data". Below that, CRUD for rules, a "test this message" box, and the parsed-message log from §8.3.                                                                                                                                                                   |
| **Integrations**       | The last run, status, and stats for each job from `integration_run`, with "run now" buttons. People the messaging tool didn't match are listed here, and the configured providers and their capabilities are shown.                                                                                                                |
| **Branding**           | Upload a tokens file, edit the token → slot mapping, see a live preview of the directory, map, and org chart with the draft theme, read the contrast report, upload logos and fonts, and roll back to an earlier theme version. Export the active theme as DTCG JSON (§9.1). |
| **Seating**            | Per office: lock people in place, plan seating so each primary team sits together across the office's desks, review the moves, apply them in one transaction (Phase 7 N10). |
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

**Serving.** `globals.css` uses Tailwind v4 `@theme inline` to point utilities at the slot variables (for example `--color-primary: var(--primary)`), with the defaults from `slots.ts`. The root layout links `/theme.css`, which returns the active theme's `compiledCss` with an ETag and a long cache keyed by the theme version. It's a stylesheet rather than an inline `<style>`, so it fits the CSP in §10. When no `theme` row is active, the route serves OrOv's defaults (the values `theme/default.tokens.json` is generated from), or the file named by the `THEME_TOKENS_PATH` env var, mapped by slot name.

**Fonts and logos.** `next/font` works only at build time, so runtime brand fonts are uploaded WOFF2 files stored as `brand_asset` rows, served same-origin from `/api/brand-assets/[id]`, and declared with generated `@font-face`. SVG logos go through the same sanitize step as floor SVGs (§6). `appName` and the favicon feed Next.js `generateMetadata`.

**Per-office map colors (Phase 6).** An office can override the map slots (`map.*`, `room.*`) for its own floors; the rest of the app keeps the active theme. Stored as `location.mapTheme` (values by mode, through the same value grammar), checked with the same contrast rules against the active theme, and emitted as custom properties scoped to `[data-location-theme="<location id>"]` around the map, which works because utilities read slots through `@theme inline`.

**Later (Phase 6).** Live sync from the Figma Variables REST API (Enterprise plans only) or the Penpot API. File upload covers every tool in v1.

---

## 10. Security and operations

- **Authentication:** every route except `/api/auth/*`, `/login`, `/dev/sign-in` (404 outside local development), `/api/health`, and the theme files the sign-in page needs (`/theme.css`, `/api/brand-assets/*`) is protected by the proxy. The domain check (and Google's `hd` and `email_verified` checks) runs on the server for every sign-in (`user.validateUserInfo` and the `admitSession` session hook), not just in the provider's prompt hint. Development sign-in methods are not registered in a production build, and `canSignIn` rejects them again if they were.
- **Authorization:** `viewer` can read everything except presence reasons (§8.4). `admin` can write. Every user can change their own settings (§7.1) and a few fields of their own directory entry on `/profile` (preferred name, phone, home time zone, other accounts; Phase 7 #20), found by their session email and audited with them as the actor, and nothing else. Presence is also gated by the display mode (§8.5): `off` exposes nothing, and `simple` exposes only an away flag, to every role.
- **Secrets:** integration credentials (service accounts, bot and app tokens, webhook signing secrets), `TOKEN_ENC_KEY`, and `AUTH_SECRET` come from the host's secret store and never live in the repo.
- **Delegated access blast radius:** where a provider reads other people's calendars or rooms through organization-wide access, grant only the read-only scopes its spike found necessary, and list them in the provider's setup guide for the tool's administrator.
- **SVG sanitizing** is described in §6. Also send a CSP with `script-src 'self'` and no `unsafe-inline` scripts.
- **Theme uploads** (§9.1): token values must pass the strict value grammar, so a token file can't inject arbitrary CSS. Uploaded fonts and PNGs are checked by magic bytes, not just the extension, and capped in size (2 MB per font, 1 MB per logo). SVG logos go through the §6 sanitizer. Fonts load same-origin only (`font-src 'self'`).
- **Data retention:** delete `presence_signal` rows older than 90 days in a nightly job.
- **Hosting:** two containers (web and worker) from one Dockerfile with different entrypoints, plus managed Postgres. Good fits: Cloud Run (web) with a GCE VM or a Cloud Run job with `min-instances=1` (worker), Fly.io, or Render. The worker must run always-on, because scheduled jobs and a live status-channel listener run in it.
- **Monitoring:** the worker writes a heartbeat row, and `/api/health` reports stale jobs. Send errors to Sentry, or log to stdout if you don't use Sentry.
- **Backups:** use the managed Postgres point-in-time recovery. Once this tool is the source of truth, backups matter.

---

## 11. Testing strategy

| Layer        | Tool                                               | What it covers                                                                                                                                                                 |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core (pure)  | Vitest                                             | Presence rule parsing (a table-driven test fed by the phrasings from the spike), presence resolution precedence, SVG parsing and diffing, CSV validation. Theme parsing, alias and mode resolution, and mapping (table-driven against the Penpot and Tokens Studio fixtures from the spike), contrast math, and CSS-emit snapshots. |
| DB           | Vitest + testcontainers Postgres                   | Recursive CTEs, cycle rejection, the desk uniqueness swap, idempotent signal upserts.                                                                                          |
| Integrations | Vitest with recorded fixtures                      | Each provider's payload mapping, against recorded responses. Every provider, and the fakes, pass the contract suite for its capability (`packages/integrations/contract/`).                                                                                          |
| End-to-end   | Playwright on `INTEGRATIONS=fake` with a seeded DB | One spec per user story U1–U13 (U12 applies a fixture theme and asserts the computed `--primary` and logo in each view; U8 runs once per display mode and asserts no presence in `off`, greying with no reason in `simple`, including in the `/api/presence` response, and pills and badges in `detailed`). The seed includes Bob → Max → Jane, HR with two sub-teams, Jane `homeRegion=CA-ON` with a desk, people with both subdivision and country-only codes, a South Wing area, and rooms in each state.      |
| CI           | GitHub Actions                                     | Lint (eslint + typescript-eslint), `tsc --noEmit`, unit, DB, and e2e tests, plus a drizzle migration check.                                                                    |

---

## 12. Delivery plan

These estimates assume one or two engineers. Each phase ends with its user stories passing in Playwright and a demo.

### Phase 0: Spikes (2–3 days per tool)

The spikes from §2, recorded in `docs/integrations/provider-notes.md`.

- [!] BLOCKED — Not started. Phase 1 was built first at the project owner's direction.
    - **Blocked:** the integration spikes need a decision on which chat, calendar and room tools to support first (§13 Q6) and access to them; the design tokens spike needs real Figma or Penpot exports. The per-provider items in Phases 4 and 5 depend on them; their provider-independent items, and Phases 2, 3 and 5.5, do not.

### Phase 1: Foundation (1–1.5 weeks) → U1 (directory part), U4, U10, U13

**Phase status:** all items done and merged into `phase/1-foundation` (2026-10-03). Integration run on the phase branch: 126 unit, 48 database (Testcontainers) and 23 Playwright specs pass. U1 (directory part), U4, U10 and U13 each have a passing spec. Not yet merged into `main`.

**Running it locally:** `docker compose up -d db` (or `docker-compose` without the Compose plugin), copy `.env.example` to `apps/web/.env.local`, then `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`. `pnpm test:e2e` builds and serves the app on port 3100 against the `orov_e2e` database. On macOS with Colima, database tests need `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`.

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
    - **Notes:** `packages/core/svg/{sanitize,parse,diff,geometry}.ts`. **Departs from §6 step 1:** SVGO runs before DOMPurify, so `inlineStyles` can copy `<style>` rules onto elements before `<style>` is dropped, and the security pass is the last thing to touch the markup. `<style>` is always removed (an inline one would style the whole page). `<use>` is re-allowed because the href hook only permits `#id` or a raster `data:image`. Area membership by nesting, else by the smallest area box containing the element's center; `geometry.ts` computes boxes server-side with transforms (no browser). `sanitize` and `parse` load jsdom and are imported by path only; `@orov/core`'s index exports just `diff`, so client code can't pull jsdom in. The seed stores floors through `sanitizeSvg` like a real upload, and a DB test checks each seeded floor diffs to "no changes" against its own drawing. Apply and rollback re-plan inside one transaction with the floor row locked (`FOR UPDATE`). Rollback switches `svgAssetId` back and reconciles rows with the same diff, without adding a version. Archived spaces come back as the same row when their id reappears. Also built, because uploads need somewhere to live: office and floor CRUD at `/admin/locations` and `/admin/floors/[id]` (§9 "Locations / Floors"). Office slugs lock once floors exist, and floor slugs once a drawing exists, because desk codes and desk ids embed them. Audit entities gained `location` and `floor`. The action body limit is now 3 MB for 2 MB drawings, and `jsdom` is in `serverExternalPackages`. Rooms and areas can't be renamed in the UI yet (Phase 4 Rooms page). Tests: 67 unit, 16 DB, 6 Playwright (U11).
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

### Phase 4: Rooms and calendar presence (1 week, plus about 2 days per provider) → U5, U8 (calendar part)

Built against the fakes (`INTEGRATIONS=fake`), then one adapter per chosen tool. Each provider-independent item can start now.

**Provider-independent**

- [ ] pg-boss in the worker, with `integration_run` bookkeeping for every job
- [ ] `deriveRoomState(blocks, now)` in `core/map/room-status.ts` and the `rooms:status` job, `/api/rooms/status`, and SWR polling that refreshes `MapSpace.status` between page loads
    - **Note:** the rendering is done (Phase 5.5, `feature/room-status-cue`): `loadMap` reads `room_status` and the map, card and list show each state.
- [ ] Room import diff (when `capabilities.directory`) and the room ↔ svg id linking UI, or manual resource ids without a directory
- [ ] `core/presence/resolve.ts` and the `presence:calendar` job, `presence_signal` → `presence_day`
- [ ] `app_setting` table and the `presence.display` setting (default `off`), with presence jobs that do nothing while it is off
- [ ] Display modes (§8.5): `simple` greying and `detailed` pills, desk badges, and privacy masking across directory, map, and org chart. Server-side filtering of presence fields by mode
- [ ] Display mode selector on the Presence admin page, with "Delete presence data"

**Per provider** (blocked until a tool is chosen and access is granted; §2 spikes first)

- [!] A `RoomProvider` adapter for the chosen room tool
- [!] A `CalendarProvider` adapter for the chosen calendar

### Phase 5: Messaging (1–1.5 weeks, plus about 3 days per provider) → U7, U8 (status-channel part)

**Provider-independent**

- [ ] `messaging:match-users` and the unmatched list on the Integrations admin page
- [ ] Chat buttons on the person card and team chips from `personLink`/`channelLink`, the selection tray (`multi` joins `selectionParsers`), the Connect flow storing `messaging_user_token` encrypted with `TOKEN_ENC_KEY`, and `POST /api/chat/group`, all driven by capabilities
- [ ] `core/presence/rules.ts` (keyword rules), the status-channel backfill job and live listener, and reaction feedback, all gated on `presence.display` (§8.5), plus a backfill when display is switched on
- [ ] Presence rules admin, "test this message" box, parsed-message log

**Per provider** (blocked until a tool is chosen and access is granted; §2 spikes first)

- [!] A `MessagingProvider` adapter for the chosen chat tool, with its app registration (a manifest or setup guide) under `docs/integrations/`

### Phase 5.5: Branding (1 week) → U12

**Phase status:** all items done and merged into `phase/5.5-branding`, then `dev` (2026-10-04), ahead of Phases 4 and 5 at the user's direction (no access to integration tools yet); it depends only on Phase 1's token layer. Integration run on the phase branch: 330 unit, 94 database (Testcontainers) and 89 Playwright specs pass, plus the CI drift checks (migrations, theme defaults, raw palette classes) and a production build with no database. U12 has a passing spec (`e2e/specs/admin-branding.spec.ts`). Not yet merged into `main`. One migration (`0003`, `theme` and `brand_asset`). **Not verified against real exports:** the Phase 0 design tokens spike hasn't run, so parsing is tested on hand-written fixtures of the Figma, Tokens Studio and Penpot formats; run real exports through the Branding page when the spike happens. Decisions later phases should know: every page now reads the active theme (`getBrand` calls `connection()`), so the e2e server migrates before starting; `/theme.css` and `/api/brand-assets/*` are public; presence UI (Phase 4) must use the `presence.*` slots and `presence.absent-opacity`; room status rendering is done, and Phase 4 adds the worker, `/api/rooms/status` and polling. Also on this phase: the search specs' ⌘K helper retries until hydration, because the render-blocking theme stylesheet widened a pre-existing race. Default colors changed: light `room.busy` `#b91c1c`, light `room.stale` `#6b7280`.

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

Feature branches merge into `phase/6-polish`, which branched from `dev` after Phase 7 (2026-10-05).

**Phase status:** closed 2026-10-05: every item that can be built without outside access is done and merged into `phase/6-polish`, then `dev`. Not yet merged into `main`. Three items stay `[!] BLOCKED`. Integration run on the phase branch: 578 unit, 151 database (Testcontainers) and 141 Playwright specs pass, plus the CI drift checks (migrations, theme defaults, raw palette classes), the production build, and a Docker build of both targets. Migrations `0016`–`0017`; take a fresh backup export after deploying, as the format refuses files from another schema version. **Pre-existing, fixed in Phase 8:** the root `pnpm test` failed at once because `@orov/worker`'s `test` script ran `vitest`, which the worker didn't depend on (`spawn ENOENT`); CI was unaffected because it runs `pnpm --filter @orov/core test` and `--filter @orov/db test`.

- [x] Mobile layout: map as full-screen sheet, directory first
    - **Completed:** 2026-10-05
    - **Branch:** merged from `feature/mobile-layout`
    - **Notes:** Below `lg` (1024 px): `FloatingPanel` (directory, org chart) and the map's new `SelectionSheet` show the selected card as a sheet fixed to the bottom of the screen (max 45dvh, scrolls), and `FLOATING_PANEL_GUTTER` adds matching bottom padding; the map's office overview stays in the page. The main menu is one row at 390 px: account links fold into a `<details>` "Menu", and Search and Menu show icons below `sm` with their names kept as `sr-only` text. **Full screen** is a "Full screen" toggle (`aria-pressed`) in the map's zoom controls at every width: the map container becomes `fixed inset-0` (`data-full-screen`) with the drawing pinned to the top so the sheet covers empty space; Escape or the toggle leaves it, and the drawing is refitted either way. It's a CSS mode, not the Fullscreen API, so the sheet (z-50) sits above it (z-40) and it works on iPhones. The view bar (floor and area buttons) is hidden while full screen. "Directory first" needed nothing: `/` already lands on the directory. **Not done:** the directory table still scrolls sideways on a phone rather than becoming a list of cards; the admin pages weren't reworked for phones. Tests: 3 Playwright (`e2e/specs/mobile.spec.ts`); the full suite (139) passes at desktop width.
- [x] Click-to-place seat editor in the app, so new desks don't need a Figma round-trip (done as Phase 7 #21 step 2, 2026-10-04)
- [!] "Who's in today" dashboard per location (shown only when presence display is on, §8.5)
    - **Blocked:** needs presence data and the `presence.display` setting from Phase 4, which waits on the Phase 0 spikes.
- [!] Optional HRIS sync, which replaces CSV as the people source
    - **Blocked:** needs a choice of HRIS (and API access to it) from the project owner.
- [!] Live theme sync from the Figma Variables REST API (Enterprise plans only) or the Penpot API
    - **Blocked:** needs a Figma Enterprise file and token, or a Penpot instance, and the Phase 0 design tokens spike's real exports.
- [x] Per-location theme overrides
    - **Decided (2026-10-05):** map slots only, on that office's map only; the rest of the app keeps the organization's theme.
    - **Completed:** 2026-10-05
    - **Branch:** merged from `feature/location-theme`
    - **Notes:** Migration `0017` adds `location.map_theme` (jsonb, null = none). `core/theme/location-override.ts`: `LOCATION_THEME_SLOTS` (the 8 map slots), `locationThemeSchema` (each value through `parseSlotValue`; blanks dropped; an empty override is null), `withLocationTheme` (a light-only slot keeps its value in dark; dark values are ignored for a light-only theme), `locationThemeReport` (the theme's contrast checks that involve an overridden slot), `emitLocationThemeCss` (re-parses every value and refuses an unsafe scope id). `setLocationMapTheme` writes with an audit entry (`location` update, before/after `mapTheme`). `loadMap` adds `locationId` and `locationTheme` to `MapFloor`; the map page emits the scoped `<style>` and `MapView` puts `data-location-theme` on its content grid, so the list view, cards and full-screen map are covered; the view bar isn't. Admin: "Map colors" on `/admin/locations/[id]`, a table of slots with a tick and a color (or opacity) input per mode, the Branding page's `ContrastReport` live, and "Save even though … checks fail". **Known gap:** applying a new organization theme doesn't re-check office overrides; `docs/theming.md` tells admins to re-check. The admin seat picker and drawing editor keep the organization's colors. Tests: 10 unit, 1 DB, 2 Playwright.
- [x] Searchable ISO 3166 region picker in the admin person and location forms, in place of the free-text code
    - **Completed:** 2026-10-05
    - **Branch:** merged from `feature/region-picker`
    - **Notes:** `components/admin/region-picker.tsx` is an ARIA combobox fed by `GET /api/regions?q=` (any signed-in user, cached privately for an hour), so the ISO 3166-2 list still never reaches the browser; the client imports only the `RegionOption` type. `searchRegions` in `core/regions/iso3166.ts` matches every query word as a prefix of the code or the "Region, Country" label, ignoring accents ("karnataka" finds Karnātaka). Ranking: the exact code, then countries before subdivisions, then names starting with the query. The current code's full name is the field's description, from the same request. A typed code is still submitted as-is (uppercased), and the server's `regionCodeSchema` remains the only validation. Note: the ISO list spells some names without accents ("Quebec"). Labels are English until the UI locale item lands; `searchRegions` already takes a `locale`. Tests: 6 unit, 1 Playwright plus one assertion in the office spec.
- [x] A UI locale setting (§7.1), so country names in region labels follow the user's language
    - **Completed:** 2026-10-05
    - **Branch:** merged from `feature/ui-locale`
    - **Notes:** Migration `0016` adds `app_user.locale` (text, default `en`); `UI_LOCALES` in `core/regions/locales.ts` lists 23 languages, labelled "Deutsch (German)". `getAppUser` reads an unlisted value as `en`. `RegionFormat.locale` (optional, English when absent) is set by `regionFormatOf`, so `loadDirectory`, `loadMap` and the org chart need no change. `/api/regions` labels suggestions in the user's language and matches English names too ("germany" finds Deutschland); it's now `no-store`, since a cached reply would outlive a language change. Settings examples follow the language. **Scope:** only country names; the interface, sorting and date formats are unaffected (dates have their own setting), and labels carry no `lang` attribute, so a screen reader reads "Kanada" with the page's English voice. The backup's schema version moved with the migration, so exports taken before it no longer import. Tests: 4 unit, 1 DB, 1 Playwright.

**Total: about 7.5–9 weeks for one engineer, or about 4.5–5.5 weeks for two.** Two engineers can split phases 2 and 3, and phases 4 and 5, in parallel. Phase 5.5 depends only on Phase 1's token layer, so it can run alongside any later phase.

### Phase 7: Improvement

The improvement backlog raised after Phases 1–3. Each item keeps its number from the original backlog note (a local, gitignored `note.md`, since replaced by a newer list). Finished items record what was built; open items carry the essentials of the note's design below, so nothing depends on that file any more. Items are in the note's suggested order: the vendor-neutral schema first (cheap while Phases 4 and 5 are unbuilt), then quick UI wins, data quality, the people model, settings, map and admin, and the rename last. Feature branches merge into `phase/7-improvement`.

**Phase status:** closed 2026-10-05: every item that can be built without access to integration tools is done and merged into `phase/7-improvement`, then `dev`. Not yet merged into `main`. #3 and #4–6 (interfaces) stay `[!] BLOCKED` and move with Phases 4 and 5. Integration run on the phase branch after #30: 558 unit, 149 database (Testcontainers) and 134 Playwright specs pass, plus the CI drift checks (migrations, theme defaults) and a Docker build of both targets with no database. Migrations `0004`–`0015`; the backup format refuses files from any other schema version, so take a fresh export after deploying. Started 2026-10-04.

**G. Vendor-neutral schema**

- [x] #12 Extra account identities (GitHub, LinkedIn, …)
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/person-identities`
    - **Notes:** Migration `0004` adds `person_identity` (§5). The registry is `packages/core/people/identities.ts`: profile providers `github`, `gitlab`, `linkedin`, `website`, each with `normalize` (accepts a handle, `@handle` or profile URL; handles are lowercased) and `url`. `identityLinks` builds every link the card shows. `PersonRecord.identities` holds profile accounts only, and `diffPersonRecords` reports one change per provider (`github: old → new`). The people CSV has `github`, `gitlab`, `linkedin`, `website` columns after `primary_team`, in registry order (a test keeps them in step). **Departs from the full-state rule:** a blank cell clears an account, but a file *without* the column keeps the person's current value (`ValidPersonRow.keepIdentities`), so a spreadsheet from before the columns existed doesn't wipe accounts. `parseCsv` now returns `headers` for that. Duplicates are refused in the form (naming the holder, field `identities.<provider>`) and in the import planner (claims work like desk claims, so two people can swap accounts in one file). `savePerson` and the import replace only profile rows, so #4's messaging ids survive. The card shows labelled text links ("GitHub"), not icons, because no icon library is installed. Bob has seeded GitHub and LinkedIn accounts. The person action now reports nested field paths (`identities.github`). Tests: 32 unit, 4 DB, 1 Playwright.
- [x] #4–6 Provider-agnostic messaging, calendar and room status: schema renames
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/vendor-neutral-schema`
    - **Notes:** Migration `0005` (§5 updated): `person.slack_user_id` → a `slack` row in `person_identity` (the registry has a `slack` provider of kind `messaging`, read-only: the form schema refuses it and saves keep it); `slack_user_token` → `messaging_user_token` with PK `(person_id, provider)`; `team.slack_channel_id` → `chat_channel_id`; `space.google_resource_email` → `calendar_resource_id`; `location.google_building_id` → `external_building_id`; `presence_source` values → `message`, `calendar_ooo`, `calendar_working_location`, `manual`, plus `presence_signal.provider` (NOT NULL), now part of the `presence_signal_source` unique index. Existing values are carried over, not dropped. The teams CSV reads `slack_channel_id` as an alias; the team form says "Chat channel ID". **The migration is hand-written**, because drizzle-kit asks interactively about renames. The snapshot was produced from `schema.ts` with `generateDrizzleJson` from `drizzle-kit/api`, keeping the id chain of a `generate --custom` file. `drizzle-kit generate` reports no changes, and a database built from `0000`–`0005` dumps the same schema as one built by `drizzle-kit push` (compared once by hand). Use the same method for the next rename. §3, §4 and §8 were rewritten around providers in Phase 8. Tests: 5 unit, 1 DB updated.

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
    - **Notes:** `core/backup/crypto.ts` (server-only, imported by path): `encryptExport`/`decryptExport`, scrypt N=2¹⁵ r=8 p=1 (64 MB `maxmem`) → AES-256-GCM, file `{ format: "orov-export", version: 1, kdf, cipher: { iv, tag }, ciphertext }`; passphrase ≥ 12 characters; a crafted file can't ask for absurd scrypt costs. `queries/backup.ts`: sections in FK order (locations, floors, svgAssets, areas, spaces, teams, people, teamMembers, personIdentities, appUsers, brandAssets, themes), generic over drizzle column metadata (generated `person.name` skipped, timestamps revived, bytea as base64); `exportOrganization`, `exportOrganizationAudited`, `planImport` (per-section create/update/unchanged; merge conflicts on office/team slug, email, desk code, account), `applyImport` (one transaction; deferred self-references floor→svgAsset, team→parent/lead, person→manager set in a second pass; cycle checks; `syncInheritedMemberships`; roles from the file only with `applyRoles`; importing admin forced to admin; replace mode also clears room status, presence and messaging tokens). Audit entity `organization`, actions `export`/`import`. **Schema version** is the database's latest `drizzle.__drizzle_migrations.created_at`; **any other version is refused**: format v1 has no upgrade steps yet, so the first schema change after this must add them (or exports must be retaken). Web: `POST /api/admin/backup/export` and `/import` (route handlers, no server-action body limit), `/admin/backup` with "Backup" in the admin nav. `app_settings` don't exist yet, so aren't exported. README "Backup and moving instances"; §9 row. Tests: 4 unit, 5 DB (including a full replace round trip equal row for row), 2 Playwright.

**N. Second list (from the replaced `note.md`, 2026-10-04)**

Built after #21 step 2, #22 and #29, at the project owner's direction; #30 still goes last. Numbered N1–N10 to keep them apart from the original items.

- [x] N1 Allow dual managers
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/multiple-managers`
    - **Decided (2026-10-04):** **equal** managers, **any number**. In the reporting chart a person appears under each of their managers (as the team tree shows multi-team people), with their own reports under the first only, so whole subtrees aren't duplicated; selecting them highlights every node. The people CSV's `manager_email` takes several emails separated by `;`. Storage moves to a `person_manager(personId, managerId, position)` table; cycle checks walk every edge; #11's default applies when there are none.
    - **Notes:** Migration `0015` is hand-written (snapshot via `generateDrizzleJson`, schema compared against a push): it drops the old index first, since Postgres shares one namespace between tables and indexes and the index on `person.manager_id` was named `person_manager`, then backfills. `PersonRecord.managerEmails`, `PersonForm.managerIds`, `DirectoryPerson.managers`, admin rows' `managerIds`/`managerNames`. Core: `reachesAncestorAny` (multi-parent cycle walk) in the import planner; `reportNodeId`/`standsFor` in `core/org/tree.ts` (extra nodes `<managerId>>personId` are leaves under each other manager). DB: `hasManagerCycle` and `managerWouldLoop` walk `person_manager`; `writeManagers`; the loop error names the blocking manager. Bulk edit's "Set manager" makes that the only manager. Backup gained a `personManagers` section. The manager arrays compare as sets in diffs, so reordering alone isn't a change. Tests: 5 unit, 4 DB, 1 Playwright; many fixtures updated.
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
- [x] N9 Assign a person to an office without a desk
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/office-without-desk`
    - **Notes:** Migration `0014` (`person.office_id` → `location`). Stored only without a desk: `savePersonIn` and the import planner drop it when a desk is set, and the planner refuses an office that isn't the desk's. `DirectoryPerson.office`, `officeSlugOf` (desk office, else assigned office) for the office filter, `locationSummary` badge shows the office instead of "Remote". `PersonRecord.officeSlug`; CSV `office` column after `desk`, in `KEPT_IF_ABSENT`. Time zone default (#19) falls back to the office's. Map overview: "N people work here without a desk". `deleteLocation` refuses an office with people in it. **Not handled:** archiving an office leaves its desk-less people pointing at it (they show the archived office's name); a follow-up could ask, as with desks. Tests: 5 unit, 2 DB, 1 Playwright.
- [x] N10 Seating planner: admins plan a seating chart by grouping, lock individuals in place, and auto-regroup the rest
    - **Decided (2026-10-04):** group by primary team, over the desks of one office (all its floors); locked people keep their desks; everyone else is placed so each team sits together (same floor and area, nearest desks). Computed and applied in one sitting: a preview of moves, then one transaction with an audit entry per person. No saved drafts.
    - **Completed:** 2026-10-04
    - **Branch:** merged from `feature/seating-planner`
    - **Notes:** `core/seating/plan.ts` `planSeating(desks, people)` (pure): locked people keep their desks; teams seated largest first, no-team last; a new team starts in the first area with a desk for every member (else the roomiest); each member takes the free desk minimizing floor change (1,000,000) + area change (400) + distance to the team's centroid − 60 for their own desk. `core/svg/positions.ts` `deskCenters(svg)` (server-only, jsdom) supplies positions. `queries/seating.ts`: `loadSeatingInput` (non-archived floors with drawings; active people at the office's desks), `previewSeating`, `applySeating` (validates the exact reviewed moves, clears then sets desks, audits each). UI: `/admin/locations/[id]/seating` ("Plan seating" on the office list). **Scope:** rearranges people who already have a desk in the office; people in the office without a desk (N9) aren't given desks by it. Tests: 5 unit, 3 DB, 1 Playwright.

**G. Integrations (with Phases 4 and 5)**

- [x] #4–6 Provider-agnostic interfaces in `packages/integrations`
    - **Completed:** 2026-10-06, in Phase 8 (`feature/integrations-scaffold`); see its notes. The adapters themselves are per-provider items in Phases 4 and 5.
    - **Design (from the note):** `MessagingProvider` (`matchUsers(emails)`, `listProfiles()` for #3, `personLink`/`channelLink` with web fallback, `openGroupChat(viewerToken, ids)`, `maxGroupSize`, `subscribeStatusChannel`/`history(since)`, `react(messageRef, emoji)`), `CalendarProvider` (`outOfOffice`, `workingLocation`), `RoomDirectory` + `RoomStatusSource` (`listRooms()`, `freeBusy(resourceIds, from, to)`), fakes for each. Selected by env: `MESSAGING_PROVIDER`, `CALENDAR_PROVIDER`, `ROOMS_PROVIDER`; `INTEGRATIONS=fake` sets them all. Providers declare capabilities (`supportsGroupChat`, `supportsReactions`) and the UI hides what's missing. Candidate tools are in `docs/integrations/provider-notes.md`.
- [!] #3 Sync photo and title from the messaging tool
    - **Blocked:** needs #4's `MessagingProvider.listProfiles()`, so Phase 5; #2 is done
    - **Design (from the note):** wire `photoUrl` through `DirectoryPerson`, the card, the map overlay (`<image>` with a circular clip, falling back to initials) and org nodes (scheme-checked, through `escapeHtml`). A nightly `profiles:sync` job plus an admin "Sync now" with a diff (reuse `diffRecords` and the import dry-run UI). Per-field precedence (`person.title_source: manual | synced`; an admin edit flips it to manual). Proxy images same-origin (`/api/avatars/[personId]`) to keep CSP `img-src 'self'`. Open question: sync titles at all? Recommended: photos on by default, titles opt-in per deployment.

**H. Rebrand**

- [x] #30 Rename the project from OfficeOrg to OrOv
    - **Completed:** 2026-10-05
    - **Branch:** merged from `feature/rename-orov`
    - **Depends on:** every other item; it touches nearly every file. Done with #3 and #4–6 still blocked, at the project owner's direction (2026-10-05), so Phases 4 and 5 are built under the new name.
    - **Notes:** One mechanical commit (`OfficeOrg` → `OrOv`, `officeorg` → `orov`; nothing used `OFFICEORG_*`), plus one fix. Databases are `orov`, `orov_test`, `orov_e2e` (the main one never had a `_dev` suffix, so it stays without one), user and password `orov`. `docker-compose.yml` sets `name: orov`, so the volume is `orov_pgdata` whatever the folder is called: Postgres applies `POSTGRES_USER` only to a fresh volume, so a new volume was needed anyway, and the old `<folder>_pgdata` is left intact (README "Renamed from OfficeOrg" gives the switch-over steps). The theme advisory lock key is now `orov.theme`; don't run an old and a new replica together while applying a theme. **Fix:** the backup format id is now `orov-export`, and `decryptExport` still reads `officeorg-export` (`LEGACY_EXPORT_FORMATS`; the id isn't part of what GCM authenticates). A theme that was applied before keeps its stored `appName`; only the default changed. Acceptance: `pnpm install`, the dev database switch-over, and `docker build` of both targets (tagged `orov-web`, `orov-worker`) checked. Tests: 1 unit added, 1 extended.
    - **Design (from the note):** replace `OfficeOrg` → `OrOv` and `officeorg` → `orov` (and any `OFFICEORG_*` → `OROV_*`) across README, plan.md, docs, package names (`@orov/*`), `pnpm-workspace.yaml`, the Dockerfile, compose service and volume names, CI image and artifact names, `.env.example`, code comments and strings, and the database init script (`orov_dev`, `orov_test`, `orov_e2e`). Keep table names and type names. One commit with no logic changes. Acceptance: `pnpm install`, `pnpm dev` and the Docker build work with the new names; images tagged `orov-web` and `orov-worker`.

### Phase 8: Public release

The first public release ships without any chat, calendar or room-booking connection. This phase makes the code and docs tool-agnostic, builds the provider-neutral start of the integrations, and brings the documentation up to a standard that outside contributors and adopters can work from. Feature branches merge into `phase/8-public-release`, branched from `dev` on 2026-10-06. The project is licensed under MIT No Attribution (`LICENSE.md`).

**Phase status:** every item done and merged into `phase/8-public-release` (2026-10-06); merged into `dev` the same day. Not merged into `main`: see the release checklist. Integration run on the phase branch: 582 core and 33 integrations unit tests, 160 database (Testcontainers) and 153 Playwright specs pass, plus lint, typecheck, the CI drift checks (migrations, theme defaults, raw palette classes, vendor names, the demo file's schema version), a Docker build of both targets, and the worker image starting with `INTEGRATIONS=fake`. One migration (`0018`, the sign-in tables); take a fresh backup export after deploying, and everyone signs in once more after the move to Better Auth. **Pre-existing, not fixed:** `docs/map-authoring.md` isn't Prettier-formatted (CI doesn't check Markdown).

- [x] Root `pnpm test` passes (the worker's `test` script had no `vitest`)
    - **Completed:** 2026-10-06
    - **Branch:** merged from `fix/worker-test-script`
    - **Notes:** `vitest` added to `@orov/worker` devDependencies; the script keeps `--passWithNoTests` until the worker has jobs. Root `pnpm test`: 578 unit, 151 database. Database tests still need Docker (Colima settings in the README).
- [x] Vendor-neutral code and copy, with a CI guard against vendor names
    - **Completed:** 2026-10-06
    - **Branch:** merged from `feature/neutral-integration-copy`
    - **Notes:** The `slack` entry is gone from `core/people/identities.ts`. Messaging user ids live in `person_identity` under the configured messaging provider's id, and that provider's adapter validates them (`MessagingProvider.normalizeUserId`). `profileIdentities`/`writeProfileIdentities` already ignore non-profile rows, so stored ids survive. Tests use the neutral provider id `chat`. The team form, import page, login copy and schema comments name capabilities, not vendors. The `slack_channel_id` CSV alias stays as a legacy header. A new CI step, "No chat, calendar or booking vendor names", greps `apps`, `packages` and `e2e`, exempting `packages/db/migrations` (immutable), `packages/integrations/providers/` (where a vendor adapter lives) and the alias. **Departs from the plan:** migration `0000` keeps no added comment, because editing an applied migration changes its stored hash; `0005`'s header already explains the renames. Tests: 578 unit, 151 DB, 37 affected Playwright specs.
- [x] `packages/integrations`: provider interfaces, registry, fakes and contract tests
    - **Completed:** 2026-10-06
    - **Branch:** merged from `feature/integrations-scaffold`
    - **Notes:** `@orov/integrations` has no dependencies. `MessagingProvider`, `CalendarProvider` and `RoomProvider` follow the Phase 7 #4–6 design, with one change: the room directory and busy times are one `RoomProvider` with an optional `listRooms` (`capabilities.directory`), since a booking tool may report status only. **Adapters report facts, not statuses:** `CalendarPresenceEvent` is `out_of_office` or `working_location` (`home`/`office`/`other`) and `StatusMessage` is raw text; mapping them to `presence_status` is the future pure `core/presence` module, shared by all providers. Each optional method has a capability flag, and the contract suites (`contract/*.ts`, imported by path from tests only, since they import vitest) check that the two agree, plus links (https web fallback), matching (case-insensitive, lowercased keys), window clipping, empty windows, and unknown rooms being left out rather than throwing. `registry.ts`: `parseIntegrationConfig` (pure), `loadIntegrations(env, factories)` (unknown id → `IntegrationConfigError` naming the known ids), `requireEnv` for adapters, `describeIntegrations` for logs. `none` is `null`; `messagingCapabilities(null)` etc. return all-false. `INTEGRATIONS=fake` overrides the three variables, so an offline run can't reach a real tool. The fakes mirror the seed's people (Sam deliberately unmatched) and rooms (one in each map state), with an injectable clock; their resource ids use `.invalid` and aren't linked to seeded spaces yet (the room-linking UI does that). Real adapters go in `providers/<id>/`, which the CI vendor-name guard exempts. The worker loads the settings at startup and exits 1 on a bad id; nothing else is wired yet. Tests: 33 unit (registry, fakes through every contract).
- [x] Integration architecture docs, and §2–§4, §8, §10, §11, §13 and Phases 4–5 rewritten around providers
    - **Completed:** 2026-10-06
    - **Branch:** merged from `feature/integration-architecture-docs`
    - **Notes:** `docs/integrations/README.md` (design rules, data flow, planned jobs, identity, per-user tokens, configuration, "Adding a provider", what can be built now) and `docs/integrations/provider-notes.md` (unverified research on specific tools, moved out of §2 and §8). In `plan.md`: a "How to read this file" note; `report.md` (not in the repo) is no longer referenced; §2 is a spike template per capability; job names are neutral (`rooms:status`, `presence:calendar`, `presence:messages-backfill`, `messaging:match-users`, live listener); chat routes are `/api/chat/connect/*` and `/api/chat/group`; Phases 4 and 5 split into provider-independent and per-provider items; Phase 0 is `[!] BLOCKED` on a choice of tools (§13 Q6, new); Phase 7 #4–6 interfaces marked done. Migration history in the Phase 7 notes keeps the old column names, since it describes what `0005` did. **Departs from the plan:** the `.gitignore` fix moved here from the public-docs item, because `provider-notes.md` would otherwise have been ignored; it ignores only local notes (`note.md`, `claude.md`, `report.md`) and the two agent files `next dev` writes into `apps/web`. Links to `CONTRIBUTING.md` and `docs/configuration.md` resolve once the public-docs item lands.
- [x] Public docs: README, CONTRIBUTING, architecture, configuration, adapting, SECURITY, CHANGELOG
    - **Completed:** 2026-10-06
    - **Branch:** merged from `feature/public-docs`
    - **Notes:** The README is rewritten for outside readers (what it is, features by area, an Integrations section, a documentation index, license); the OfficeOrg rename steps moved to `CHANGELOG.md` (0.1.0, unreleased). New: `CONTRIBUTING.md` (setup, every CI check, conventions, migrations, workflow and the `plan.md` progress format), `docs/architecture.md` (the system as built), `docs/configuration.md` (every environment variable), `docs/adapting.md` (setting up an instance; configuration vs. code), `SECURITY.md` (GitHub private vulnerability reporting). Every `package.json` has `"license": "MIT-0"`; `.env.example` points at `docs/configuration.md`. **Known gap, documented:** §10's site-wide Content-Security-Policy was never built; only `/api/brand-assets/*` sends one. `docs/architecture.md` and `SECURITY.md` say so.
- [x] Map and org chart fill the screen between the menus and the selected card, with the floor fitted whole and space around it
    - **Completed:** 2026-10-06
    - **Branch:** merged from `feature/full-height-views`
    - **Notes:** The `(app)` layout is `h-dvh flex-col`; the window never scrolls, `<main>` does (`flex-1 min-h-0 overflow-y-auto`), and views fill it with `flex-1`. Consequences: `ViewBar` sticks at `lg:-top-6` (a sticky offset counts from inside `<main>`'s 1.5rem padding), and anything that scrolled the window must scroll `<main>` (`mobile.spec.ts` updated). **Map:** the right column stays (office overview or card) and scrolls on its own; the map section takes the rest. The drawing fills its box less a margin (`p-4 pt-12 sm:p-6 sm:pt-12`, clear of the zoom controls) through `[data-floor-map][data-fit] svg { height: 100% }` and the SVG's default `preserveAspectRatio` (meet), so it letterboxes and centers; the admin seat picker and drawing editor keep the natural height. The margin is on a div of its own because react-zoom-pan-pinch's unlayered stylesheet zeroes its content's padding and beats Tailwind utilities. Overlay boxes were already in drawing units, so nothing is re-measured on resize. A drawing with its own `preserveAspectRatio` other than meet would not fit; none of the sample floors has one. On a phone the map fills the screen under the menus and the office overview follows below it. **Org chart:** `h-full`, and a `ResizeObserver` gives d3-org-chart the new height and redraws (renders after the first keep pan and zoom). List views scroll inside the same box. Tests: `e2e/specs/layout.spec.ts` (6) at 1280×800 and 390×844, with and without a card: boxes inside the viewport and reaching its bottom, every desk and room inside the map box, no window scroll. Full suite: 147 Playwright.
- [x] Sign-in on Better Auth instead of Auth.js, which is in maintenance mode, keeping every setting and provider id
    - **Completed:** 2026-10-06
    - **Branch:** merged from `feature/better-auth`
    - **Notes:** `better-auth` 1.7.7; `next-auth` is gone from the web app and the root. **Unchanged:** every setting (`AUTH_SECRET`, `AUTH_URL`, `AUTH_PROVIDERS`, `AUTH_<ID>_*`, the dev variables), provider ids, and redirect URIs (`/api/auth/callback/<id>`; an e2e spec checks Google's). Google is Better Auth's built-in provider with `hd` = `COMPANY_DOMAIN`; `microsoft-entra-id` (the `microsoftEntraId` helper, tenant GUID taken from the issuer, so a domain-style tenant is now refused), `okta` (`okta()` helper), `cognito` and `oidc` (discovery from the issuer, `requireIdTokenVerification`) go through the generic OAuth plugin. **Gate:** `user.validateUserInfo` runs `canSignIn` on `signInIdentity(email, source)` (new in `core/auth/policy.ts`), which reads the provider id and raw claims; Better Auth calls it on every provider sign-in, new or returning, and when a dev user is created. `databaseHooks.session.create.before` calls `admitSession` (`db/queries/app-users.ts`): the domain again for any method, then `recordSignIn`. **Sessions** are `auth_session` rows (migration `0018`, with `auth_user`, `auth_account`, `auth_verification`), 7 days and refreshed daily (Better Auth's defaults); sign-out revokes, checked by hand. Provider tokens are encrypted (`encryptOAuthTokens`), account linking only between configured providers, email/password off, telemetry off. The auth tables are left out of backups and survive a Replace. **Dev sign-in** is a server-only plugin endpoint (`createAuthEndpoint.serverOnly`, `lib/dev-sign-in.ts`) registered only when `devAuthAllowed`; the login actions call it. The proxy now only checks the session cookie exists (`getSessionCookie`); `lib/session.ts` validates it against the database. **e2e** sign-in writes an `auth_user` and `auth_session` row and signs the cookie with better-call's `serializeSignedCookie` (root devDependency pinned to Better Auth's 1.4.0). `auth.spec.ts`'s Auth.js providers check became three: the dev endpoint isn't routed, email/password is off, and only configured providers start a sign-in. Checked by hand under `next dev` (an isolated copy, since a dev server was already running): wrong password, another domain refused before any user row is written, an `ADMIN_EMAILS` address promoted, sign-out revoking the cookie. **Upgrade:** everyone signs in once more. Tests: 4 unit, 3 DB, 4 Playwright added; full run 582 unit, 33 integrations, 154 DB, 150 Playwright.
- [x] Clean install: no demo data by default; a comprehensive demo organization ships as a backup file anyone can import, and `pnpm db:seed` loads it
    - **Completed:** 2026-10-06
    - **Branch:** merged from `feature/demo-data`
    - **Notes:** **Clean install:** the Quickstart no longer seeds; `GettingStarted` (`components/getting-started.tsx`) replaces the directory and org chart when there are no people, and the map when there is no office: admins get links to Offices & floors, Import & export and Backup (with the demo file and passphrase), others a note that it isn't set up. The first admin comes from `ADMIN_EMAILS` through `admitSession`. **Test fixture:** `seed.ts` → `test-fixture.ts` (`seedTestFixture`), `seed-floors/` → `test-floors/`; data and ids unchanged, used only by tests. **Demo:** `packages/db/demo/`: `organization.ts` (3 offices, US-CA/GB-ENG/DE-BE, floors called Floor/Level/Building, 25 teams four levels deep, about 115 people from a seeded PRNG: 5 with two managers, 3 deskless in an office, 6 remote in other countries, 4 inactive with a last day, GitHub/LinkedIn/website accounts, phones, London's own map colors), `floors.ts` (SVGs to the authoring rules), `build.ts` (drawings through `sanitizeSvg`, rows from `parseFloorSvg`, so each floor diffs to no changes; the theme "OrOv Demo" through `applyTheme`), `build-file.ts` (`pnpm demo:build`: Testcontainers Postgres, migrate, build, `exportOrganization`, `encryptExport`), `file.ts` (`DEMO_PASSPHRASE` = `orov-demo-data`, `loadDemo` = `applyImport` Replace with roles). `pnpm db:seed` resets and loads it. `demo/orov-demo.json` (~200 KB) is in `.prettierignore`. **Drift:** `demo/file.test.ts` (no database) fails when the file's `schemaVersion` isn't the journal's last `when`, naming the command; it runs with the database tests in CI. **Deviation:** the demo is written with direct inserts rather than the admin save functions (which need an actor and write audit entries the export leaves out), with the parser and theme pipeline keeping it honest. Tests: 6 DB (determinism, floors vs drawings, seating, loading the committed file), 3 Playwright (`first-run.spec.ts`: admin and viewer on an empty instance, and loading the demo through Admin → Backup → Replace).

**Release checklist** (outward-facing, for the maintainer; not done in this phase):

- [ ] Merge `dev` into `main` once this phase is accepted
- [ ] Create the public repository and push only `main` and `dev` (the local feature and phase branches stay local)
- [ ] Enable GitHub private vulnerability reporting, which `SECURITY.md` relies on
- [ ] Tag `v0.1.0` and date the `CHANGELOG.md` entry

### Phase 9: Security hardening

Findings from a pre-release security review (2026-10-06), fixed before the first public release. Feature branches merge into `phase/9-security-hardening`, branched from `dev` on 2026-10-07.

**Phase status:** every item done and merged into `phase/9-security-hardening` (2026-10-07), then into `dev`. Not merged into `main`: the Phase 8 release checklist still applies. Two issues beyond the review were found and fixed while verifying: local `.env.local` files were baked into Docker images, and the backup routes accepted same-site cross-origin posts. Integration run on the phase branch: 613 core and 33 integrations unit tests, 170 database (Testcontainers) and 163 Playwright specs pass, plus lint and typecheck; both Docker targets build and start as uid 1000. The first full Playwright run caught the frame-header regression in the branding preview (fixed in `fix/same-origin-frames`). One migration (`0019`, `app_user.disabled_at`); the demo file was rebuilt for it. **Upgrade notes** are in the CHANGELOG: generic OIDC needs `email_verified`, access now follows People's active flag and last day, rebuild images (rotate secrets if an old image was pushed), restart the local database for the loopback port. **Pre-existing, not fixed:** `schema.test.ts` "cascades a person's team memberships" flaked once under a parallel run; Next logs "The destination stream closed early" during e2e navigations, on `dev` too. **Follow-ups:** a nonce-based `script-src`; a slim runtime image (needs the migration and worker precompiled or a separate image).

- [x] Generic OIDC requires a verified email; implicit account linking only where it is safe
    - **Completed:** 2026-10-07
    - **Branch:** merged from `feature/oidc-email-verification`
    - **Notes:** The `oidc` provider needs `email_verified=true`; `AUTH_OIDC_TRUST_EMAIL=true` accepts a missing claim, never an explicit `false` (`SignInOptions.trustOidcEmail` in `core/auth/policy.ts`, read in `lib/auth-providers.ts`). Entra, Okta and Cognito keep accepting a missing claim (tenant-pinned). `accountLinking.trustedProviders` is gone, so Better Auth joins a sign-in to an existing user (second provider, or a recreated IdP account with a new `sub`) only when that provider reports the email verified; Better Auth runs `validateUserInfo` before linking too. A refused link redirects with `account_not_linked`, which the login page now explains. **Known limitation:** an Entra user who also signs in through another provider, or whose Entra account is recreated, is refused (Entra sends no `email_verified`) until the old `auth_user`/`auth_account` row is removed; the access-revocation item adds a way to do that. Docs: `.env.example`, `docs/configuration.md`, `docs/architecture.md`, CHANGELOG (Security hardening, Upgrading). Tests: 5 unit added, 1 case removed from the tenant-scoped `it.each` (586 core); `auth.spec.ts` 7/7.
- [x] Exported CSV cells can't run as spreadsheet formulas
    - **Completed:** 2026-10-07
    - **Branch:** merged from `feature/csv-formula-guard`
    - **Notes:** `core/csv/formula.ts`: `neutralizeFormula` prefixes `'` to a cell starting with `= + - @`, tab or CR, except a signed plain number (`/^[+-][\d\s().-]*$/`, so E.164 phones stay clean); `SAFE_CSV_CAST` plugs it into `csv-stringify` for the people, teams and audit exports. `parseCsv` applies `restoreFormula`, the exact inverse, to every cell, so an export re-imports unchanged and a hand-typed leading apostrophe is kept. Stored values are not changed or rejected: the guard is at the export boundary only. Prettier reformatted a few existing lines in the touched CSV files. Docs: `docs/adapting.md`, CHANGELOG. Tests: 24 unit (`formula.test.ts`, people and teams round-trips with formula text), 610 core; DB `import`/`audit` 21 pass (Testcontainers needs the README's Colima `DOCKER_HOST`).
- [x] Site-wide security headers: no framing, HSTS, referrer and permissions policies
    - **Completed:** 2026-10-07
    - **Branch:** merged from `feature/security-headers`
    - **Notes:** `apps/web/next.config.ts` `headers()` on `/:path*` (so `/api/auth/*`, which the proxy skips, gets them too): CSP `frame-ancestors 'self'; base-uri 'self'; object-src 'none'`, `X-Frame-Options: SAMEORIGIN` (first shipped as `'none'`/`DENY`, which broke the Branding page's same-origin preview iframe; fixed in `fix/same-origin-frames`, caught by the phase integration run), HSTS (2 years, `includeSubDomains`, no preload), `Referrer-Policy: strict-origin-when-cross-origin`, `nosniff`, `Permissions-Policy`; `poweredByHeader: false`. `/api/brand-assets/*` keeps its own sandboxing CSP. **Departs from the plan:** no `form-action 'self'`, because Chrome enforces it on the redirect after a form post and would block the no-JS redirect to the identity provider. **Follow-up:** a nonce-based `script-src` (§10) is cheap now that every page renders per request (`getBrand` calls `connection()`), but needs checking against d3-org-chart and react-zoom-pan-pinch inline styles and the map's `<style>` blocks. Docs: `SECURITY.md`, `docs/architecture.md`, CHANGELOG. Tests: `e2e/specs/security-headers.spec.ts` (5: headers on four routes, and a cross-origin frame ends on Chromium's error page).
- [x] Revoking access: inactive people can't sign in, admins can change roles, disable users and end their sessions, shorter sessions
    - **Completed:** 2026-10-07
    - **Branch:** merged from `feature/access-revocation`
    - **Notes:** Migration `0019` adds `app_user.disabled_at`. `db/queries/app-users.ts`: `hasAccess` (raw `EXISTS` query: not disabled, and any `person` with that email is `active` with `end_date` null or `>= CURRENT_DATE`, i.e. the database's UTC calendar; no person row means judged by `app_user` alone, so `ADMIN_EMAILS` bootstrap admins without a directory entry keep working). `admitSession` checks it before `recordSignIn`; `getAppUser` left-joins `person` with the same predicate, so `requireUser` redirects a revoked user to `/login` on the next request (no new error message there: the login page shows the general one if they try again, since Better Auth reports the refused session as `unable_to_create_session`). `listAppUsers` and `changeUserAccess` (`role`, `disable` (deletes their `auth_session` rows), `enable`, `end-sessions`, `reset-sign-in` (deletes `auth_user`, cascading accounts and sessions; the fix for the Entra `account_not_linked` case in the OIDC item)), each audited as entity `app_user` (added to `AUDIT_ENTITIES`), row-locked, and refused for the actor's own email. **UI:** `/admin/users` (nav "Users"), `components/admin/users-table.tsx`; the role select is disabled for `ADMIN_EMAILS` addresses (re-promoted at every sign-in) and for yourself; Reset sign-in asks to confirm. **Sessions:** `expiresIn` 1 day, `updateAge` 1 hour (was 7 days, daily). **Backup:** `applyRoles` now also governs `disabled_at`; the importer is left enabled. The demo file was rebuilt (`pnpm demo:build`) for the new schema version. **Known edge:** importing a file in which the importing admin's own person row is inactive locks them out. Docs: README (Administration, backup), `docs/configuration.md` (session lifetime, offboarding), `docs/architecture.md`, CHANGELOG (Security hardening, Upgrading: access now follows People). Tests: 10 DB (170 total; `schema.test.ts` "cascades a person's team memberships" failed once under a parallel run and passed alone and on two full reruns, untouched by this change), `e2e/specs/admin-users.spec.ts` (3), `admin-backup`/`first-run` pass.
- [x] Production refuses a missing, short or example `AUTH_SECRET`
    - **Completed:** 2026-10-07
    - **Branch:** merged from `feature/auth-secret-check`
    - **Notes:** `assertStrongAuthSecret` in `core/auth/policy.ts`: unset, a placeholder (`/^(change[-_ ]?me|changeme|secret|password|example)/i`, since `.env.example`'s is 33 characters) or under 32 characters throws; `lib/auth.ts` applies it only when `NODE_ENV=production`, so local `next dev` is unaffected. Like a provider misconfiguration it fails the first request that builds the auth instance, not `next build`. Checked by hand: the e2e build started with the placeholder answers 500 on `/api/auth/get-session` and logs the fix. The e2e secret (50 characters) passes. Docs: `.env.example`, `docs/configuration.md`, CHANGELOG. Tests: 3 unit (613 core); `auth`/`admin-users` e2e pass.
- [x] Container runs as a non-root user from a slim image; local dev services listen on loopback only
    - **Completed:** 2026-10-07
    - **Branch:** merged from `feature/container-hardening`
    - **Notes:** **Found while verifying:** `.dockerignore`'s `.env`/`.env.*` matched only at the context root, so `apps/web/.env.local` was in every image (including the `orov-web:latest`/`orov-worker:latest` built in Phase 8), and `next start` loads it; now `**/.env` and `**/.env.*` (keeping `.env.example`). Also excluded: `.github`, `e2e`, Playwright output, `.DS_Store`, logs, and the local notes and agent files from `.gitignore`. **Dockerfile:** a `runtime` stage copies `/app` from `build`, keeps it root-owned, makes only `apps/web/.next/cache` writable, and runs as `node` (uid 1000); `web` runs `tsx migrate.ts` then `exec next start` from the package dirs, `worker` runs `tsx src/index.ts`, with no pnpm at runtime. **Departs from the plan:** not a slim image. Next's `standalone` output can't carry the runtime, because `migrate.ts` and the worker run from source through `tsx`; a slim image needs a separate migration image or precompiled scripts (follow-up; the image is ~1.8 GB). **Local:** `pnpm dev` binds `127.0.0.1` and Compose publishes `127.0.0.1:5432`; existing checkouts need `pnpm db:down && pnpm db:up` and a dev server restart. Checked by hand: both targets build; web as uid 1000 migrates `orov_e2e` and answers `/api/health` and `/login` with the new headers; app files aren't writable, the cache is; no `.env*` but `.env.example` in the image; the worker starts with `INTEGRATIONS=fake`. Docs: README (quickstart, Deployment), CHANGELOG (Security hardening; Upgrading: rebuild images, rotate secrets if an old image was pushed).
- [x] CI hardening: read-only token, pinned actions, dependency audit, Dependabot; backup import size cap; rate limits behind a proxy
    - **Completed:** 2026-10-07
    - **Branch:** merged from `feature/ci-hardening`
    - **Notes:** **CI:** top-level `permissions: contents: read`; `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact` pinned to commit SHAs with the version in a comment (checked with `git ls-remote`: lightweight tags, so the SHAs are commits); new step `pnpm audit --prod --audit-level=high` (passes: the one advisory is the moderate `esbuild <=0.24.2` via `better-auth > drizzle-kit > @esbuild-kit`, dev-path only, accepted); `.github/dependabot.yml` (npm grouped minor/patch, github-actions, weekly). Dependabot's support for pnpm 11 lockfiles is unverified; check its first run. **Found while adding the size cap:** the backup routes, the only cookie-authenticated POST route handlers, had no origin check (Next gives one to server actions only) and parsed any body, so a same-site page (a sibling subdomain; the `SameSite=Lax` cookie goes along) could post `text/plain` JSON and run a Replace import. `lib/json-request.ts` `readJsonRequest(request, maxBytes)`: `application/json` only (415), an `Origin` other than `AUTH_URL`'s is refused (403), and the body is read in chunks and cut off past the cap (413; 128 MB import, 64 KB export). **Departs from the plan:** no database rate-limit storage or IP header setting. Better Auth's limiter covers only its routes, which here have no password endpoint (the dev one is server-only), so the README now says to run behind a proxy that sets `X-Forwarded-For` (Better Auth's default header). Three commits (route guard, CI, proxy docs). Docs: README (CI list, Deployment), CONTRIBUTING, `docs/architecture.md`, CHANGELOG. Tests: `admin-backup.spec.ts` +2 (cross-origin 403, `text/plain` 415 on both routes, oversized 413).

---

## 13. Risks and open questions

| #   | Item                                                                                   | Owner / default                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Status-channel messages are free text, so parsing will be imperfect.                   | Mitigated by reaction feedback, the parsed-message log, and editable rules. Could later add a structured command in the chat tool (a slash command or form), where the tool supports one. |
| R2  | The tools' administrators may hesitate to grant organization-wide read access to calendars and rooms. | Ask early, with the scoped list from the spike (§2). If refused, room status can still work through one account that can see the room calendars, but calendar presence would need per-user OAuth. |
| R3  | Showing health status (`sick`) to colleagues.                                          | **Open:** confirm with HR. Presence display is off by default. `simple` mode never shows a reason, and `detailed` mode masks sick as "Away" for viewers.                                                                                         |
| R4  | Floor drawings don't exist yet, or exist only as PDFs.                                 | **Open:** who draws them? Budget 0.5–1 day per floor in Figma.                                                                                                   |
| R5  | Spreadsheet data quality (duplicate names, missing managers).                          | The dry-run import surfaces every bad row before anything is written.                                                                                            |
| R6  | Brand palettes often fail WCAG AA, especially for status colors on the map. | The contrast gate in §9.1 blocks failing themes by default and suggests the nearest passing shade. Room status also has a non-color cue. |
| Q1  | Which channel in the chat tool is the status channel, and is there one per office?     | Default: one channel, configured by env var. A per-location channel is a small extension.                                                                        |
| Q2  | Should people be able to edit their own profile (photo, phone) without being an admin? | **Resolved (Phase 7 #20):** yes, for preferred name, phone, home time zone and other accounts. Photos wait for uploads or the synced photo (#3), so no free photo URLs. |
| Q3  | Hosting target and network access (public with SSO, or behind VPN/IAP)?                | Prefer providers whose live events use an outbound connection, which works for either; a webhook-only provider needs a public route.                            |
| Q4  | Do deskless or remote people belong on the map at all?                                 | Default: no. They appear in the directory and org chart with a "{region} [Remote]" card, in the viewer's region format (§7.1).                                    |
| Q5  | Does the organization have an exported token file, or only a PDF brand guide? | Default: start from `theme/default.tokens.json` and set the slots directly in the Branding mapping editor. A token file isn't required. |
| Q6  | Which chat, calendar and room tools to support first?                                  | **Open.** Decided per adopting organization; the first chosen tools unblock Phase 0's spikes and the per-provider items in Phases 4 and 5. |
