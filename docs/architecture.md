# Architecture

How OrOv is put together today, for someone about to change it. The full design, including parts
not built yet, is in [`plan.md`](../plan.md); where the two differ, this page and the progress
notes in `plan.md` §12 describe what the code actually does.

## The pieces

```
apps/web  ──────────┐            apps/worker
  Next.js App Router │              heartbeat + integration settings check
  server components  │              (scheduled jobs come with the integrations)
  server actions     │                   │
  route handlers     │                   │
        │            ▼                   ▼
        │      packages/db ────────► Postgres 16
        │        Drizzle schema, migrations, queries, demo
        ▼            │
  packages/core ◄────┘           packages/integrations
    pure domain logic              provider interfaces, registry, fakes,
    (no I/O)                       contract tests (no real provider yet)
```

| Package                 | What belongs there                                                                                                                                                                                                   | May import                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `packages/core`         | Pure functions: validation (zod), CSV parsing, import planning, cycle-safe tree logic, map state CSS, SVG sanitize/parse/diff, theme pipeline, region and date formatting, seating planner. Unit tested with Vitest. | Nothing from this repo              |
| `packages/db`           | The Drizzle schema (`schema.ts`), migrations, and every query, each taking a `db` or transaction so it runs either way. Tested against a real Postgres in Testcontainers.                                            | `core`                              |
| `packages/integrations` | Interfaces for chat, calendar and room providers, the env-driven registry, fakes and contract suites. See [`integrations/README.md`](integrations/README.md).                                                        | Nothing from this repo              |
| `apps/web`              | Pages, server actions, route handlers, React components. Wires `core` and `db` together.                                                                                                                             | `core`, `db`                        |
| `apps/worker`           | The long-running process for scheduled jobs and live listeners. Today it checks the integration settings and logs a heartbeat.                                                                                       | `integrations` (later `core`, `db`) |

Two `core` modules load jsdom (`svg/sanitize.ts`, `svg/parse.ts`) and one uses Node crypto
(`backup/crypto.ts`). They are deliberately left out of `core/index.ts` and imported by path from
server code only, so client bundles never pull them in.

## A request

1. **`apps/web/proxy.ts`** (Next 16's name for middleware) redirects a request without a session
   cookie to `/login`. The only public paths are `/login`, `/dev/sign-in` (404 outside local
   development), `/api/health`, `/theme.css` and `/api/brand-assets/*`, because the sign-in page
   is drawn with the theme and logo. Better Auth's own routes (`/api/auth/*`) are excluded by the
   matcher.
2. **Sign-in** goes through [Better Auth](https://www.better-auth.com) (`apps/web/lib/auth.ts`)
   with the providers in `AUTH_PROVIDERS` (`lib/auth-providers.ts`). Two checks guard it:
   `user.validateUserInfo` runs `canSignIn` (`core/auth/policy.ts`) on the provider's own claims
   (the email must be on `COMPANY_DOMAIN`, plus Google's `hd` claim or a tenant-scoped Entra
   issuer, and a verified email from Google and the generic `oidc` issuer), on every provider
   sign-in, including one that would join an existing user (which also needs the provider's
   `email_verified`, since no provider is trusted to link without it); and a hook before each
   session is created, `admitSession` (`db/queries/app-users.ts`), re-checks the domain and
   records the sign-in in `app_user`, promoting `ADMIN_EMAILS`. Sessions are rows in
   `auth_session`, so signing out ends a session everywhere.
3. **Roles** (`viewer`, `admin`) are read from `app_user` on every request (`lib/session.ts`:
   `requireUser`, `requireAdmin`), which also validates the session against the database, so a
   demotion or a sign-out takes effect at once. The same read refuses a user an admin disabled
   (`app_user.disabled_at`) and anyone whose directory entry is inactive or past its end date
   (`getAppUser`, `hasAccess`); `admitSession` applies the same rule at sign-in. Admins manage
   this on **Admin → Users** (`changeUserAccess`, audited as `app_user`).
4. **Pages** are server components that call a query (`loadDirectory`, `loadMap`, …) and pass plain
   data to client components. Region labels and dates are formatted on the server in the viewer's
   own settings, so the ISO 3166-2 list never reaches the browser.
5. **Writes** are server actions. Every admin write calls `requireAdmin()`, validates with zod,
   writes in one transaction, and records an `audit_log` entry with before and after JSON.
   Integrity rules (no manager or team cycles, one person per desk, desk swaps) are checked inside
   that transaction.

## Data model in brief

The schema is [`packages/db/schema.ts`](../packages/db/schema.ts); `plan.md` §5 explains it.

- **Places:** `location` (an office, with an ISO 3166 region and what it calls its floors) →
  `floor` → `area` and `space` (desks, meeting rooms, phone booths, points of interest). Each
  floor's drawing is an `svg_asset` row, one per version; `floor.svg_asset_id` points at the current
  one, so rolling back switches the pointer.
- **People and teams:** `person` (with a generated full `name`), `person_manager` (any number of
  equal managers), `team` (a tree through `parent_team_id`), `team_member` (`explicit`, or
  `inherited` from a sub-team, derived), and `person_identity` (other accounts: profile links
  today, messaging ids once a provider exists).
- **Users:** `app_user` holds each signed-in user's role, whether an admin disabled them, and
  their personal settings (region display, flag, date format, language), keyed by email. Better
  Auth's `auth_user`, `auth_account`, `auth_session` and `auth_verification` hold sign-in state
  only, and never go into a backup.
- **Theme:** `theme` (every applied version; one active) and `brand_asset` (logos, favicon,
  fonts, immutable).
- **Integrations, created ahead of use:** `room_status` (read by the map today), `presence_signal`,
  `presence_day`, `presence_rule`, `messaging_user_token` and `integration_run`. No column names a
  vendor.
- **History:** `audit_log`.

Seats are referenced by `space.id`, never by position in a drawing; `svg_element_id` only links a
space to its shape. Ids are prefixed strings (`p_…`, `t_…`, `sp_…`) that are safe in URLs.

## Selection lives in the URL

Which person, team or floor is selected is held only in the query string, through
[nuqs](https://nuqs.dev) parsers defined once in `apps/web/lib/url-state.ts`.
`selectionParsers` (`person`, `team`, `sub`) is shared, and the view tabs carry just those
between the directory, map and org chart. Each view adds its own parameters (`loc`, `floor`,
`area`, `space` and `view` on the map; `tree` on the org chart). A shared link therefore shows
everyone the same thing.

## The floor map

A floor drawing is an SVG whose element ids follow a naming convention
([`map-authoring.md`](map-authoring.md)). Uploads are sanitized (SVGO, then DOMPurify in jsdom),
parsed for desks, rooms and areas, and diffed against the database before anything is saved. In
the browser the sanitized SVG is injected **once**, and every state change (selection, team
highlight, room status) re-renders only a generated `<style>` block keyed by element id
(`core/map/state-css.ts`). Labels, avatars and status badges are an overlay positioned from each
element's bounding box. A List view renders the same data as a table for keyboard and screen
reader users.

## Theming

Components are styled only through semantic **slots** (`bg`, `primary`, `room.busy`, …) defined in
`core/theme/slots.ts`. Tailwind's palette is cleared, and CI fails on a raw palette class such as
`bg-white`. An admin imports design tokens, maps them onto slots, checks contrast and applies the
theme; `/theme.css` serves the active theme's compiled CSS. Details: [`theming.md`](theming.md).

## Background work and integrations

The worker is a separate process because Next.js has no reliable scheduler and a live chat
listener needs a persistent connection. Jobs will run on pg-boss, whose queue lives in Postgres.
External tools are reached only through the interfaces in `packages/integrations`, chosen per
deployment, and the web app reads only OrOv's own tables. The design and the steps for adding a
provider are in [`integrations/README.md`](integrations/README.md).

## Security model

- Sign-in is limited to one email domain, through the organization's own SSO. Emails from an
  open-ended OIDC issuer must be verified, and a sign-in joins an existing user only with a
  verified email. Development sign-in methods are ignored outside `next dev` on localhost.
- Viewers can read the directory, map and org chart; admins can change them. Anyone can change
  their own settings and a few fields of their own directory entry on **My profile**.
- Uploaded SVGs are sanitized before they're stored or shown. Theme values pass a strict grammar,
  so a token file can't inject CSS. Uploads are checked by magic bytes and capped in size, and
  brand files are served with `nosniff` and a sandboxing Content-Security-Policy.
- Backups are encrypted with a passphrase (scrypt, then AES-256-GCM). The backup routes, the only
  route handlers that change data, accept only `application/json` from the app's own origin and
  cap the body (`lib/json-request.ts`), since route handlers don't get the origin check and body
  limit Next gives server actions.
- Every response refuses framing (`frame-ancestors 'none'`, `X-Frame-Options: DENY`) and sends
  HSTS, a referrer policy, `nosniff` and a permissions policy (`apps/web/next.config.ts`).
- **Not yet:** a Content-Security-Policy that restricts scripts and styles (`script-src`, designed
  in `plan.md` §10); today's site-wide policy covers framing, `<base>` and plugins only.

To report a vulnerability, see [`SECURITY.md`](../SECURITY.md).

## Tests

| Layer      | Where                                                           | Runs with                                                                                    |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Unit       | `packages/core/**/*.test.ts`, `packages/integrations/*.test.ts` | Vitest                                                                                       |
| Database   | `packages/db/**/*.test.ts`                                      | Vitest against a throwaway Postgres (Testcontainers; needs Docker)                           |
| End-to-end | `e2e/specs/*.spec.ts`, one or more per user story               | Playwright against a production build and the `orov_e2e` database, reseeded before each spec |

The tests run against a small fixed organization, `packages/db/test-fixture.ts`, whose ids
(`p_bob`, `t_hr`, `sp_sf_2_014`, …) the end-to-end specs rely on. It is separate from the demo
organization (`packages/db/demo/`, shipped as `demo/orov-demo.json`), which is larger, generated,
and loaded like any backup.
