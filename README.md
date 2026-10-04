# OfficeOrg

An internal web app for a small company (1–3 offices, fewer than 250 people) that replaces the
spreadsheets tracking who works where. OfficeOrg is meant to be the **source of truth** for
people, teams, reporting lines and seat assignments, shown as one linked view:
person ↔ seat ↔ team ↔ manager ↔ presence ↔ Slack.

When complete it has four parts:

- **Directory**: search and filter everyone, with a shared person card
- **Floor map**: interactive SVG floor plans with desks, rooms and live meeting-room status
- **Org chart**: the reporting tree and the team tree
- **Presence** (optional, off by default): who is in, working from home or away, read from
  Google Calendar and keyword messages in a Slack channel

It can be restyled to an organization's brand, without code changes, by importing design tokens
exported from Figma, Penpot or Tokens Studio.

The full design is in [`plan.md`](plan.md): goals, user stories, data model, integrations and
the phase-by-phase delivery plan with progress notes.

## Status

**Phase 1 (Foundation), Phase 2 (Maps), Phase 3 (Org chart and selection sync) and Phase 5.5
(Branding) are complete.** None has been released to `main` yet. The parts that work today:

- Sign-in through any SSO provider Auth.js supports (Google, Microsoft Entra ID, Okta, AWS
  Cognito or any OpenID Connect issuer), limited to one company email domain, with `viewer` and
  `admin` roles
- Directory with search, team and location filters, a person card, and selection kept in the URL.
  The directory, map and org chart use the full width of the window, with the main menu staying
  at the top, the map's and org chart's controls in a bar just below it, and the selected
  person's card floating at the right.
  People have a given name and a family name, and lists sort by family name
- Floor map: the floor drawing with an avatar at each occupied desk and each room's name, zoom
  and pan, and a card for the person, desk or room you click. Switch offices and floors, open an
  area such as the South Wing as a zoomed view, and see each floor's headcount, desks and rooms.
  The map follows a selected person to their floor, and highlights a team's seats (with its
  sub-teams, unless you untick them) with a count per floor. A desk code in the directory or on
  a person card links to the map. A List toggle shows the same desks and rooms as a table for
  keyboard and screen reader users
- Org chart: the reporting tree (who reports to whom) and the team tree (teams, their sub-teams
  and members), with expand and collapse, zoom, and the person card for whoever you click. The
  chart centers on the selected person and opens their direct reports, shows their reporting
  line up to the top, and highlights a team's members (with its sub-teams, unless you untick
  them). A List toggle shows the same tree as an outline for keyboard and screen reader users
- Switching between the directory, map and org chart keeps the selected person and team. ⌘K
  (Ctrl+K) searches people, teams and rooms, with typo tolerance, from any view
- Admin pages to create, edit and deactivate people and teams, with checks that reject
  manager and parent-team cycles. The people list filters by text, team, status and desk (active
  people by default), and the teams list by name. Several people can be changed at once
  (activate or deactivate, manager, teams), after reviewing who the change applies to Desks are assigned by clicking the floor drawing; choosing a
  taken desk swaps it, after the admin confirms
- Links to a person's other accounts (GitHub, GitLab, LinkedIn, a website) on their card, set in
  the admin form or the people CSV. An account can belong to only one person
- A member of a sub-team is also a member of the teams above it (shown as "through a sub-team"),
  so team member counts include everyone under a team
- Everyone can change their own preferred name, phone, home time zone and account links on
  **My profile**, without an admin
- Admins can record a person's last working day, which only admins ever see
- Someone without a desk of their own can still belong to an office: they count for it in the
  directory's office filter and the map's overview, and get its time zone
- Someone saved or imported without a manager reports to the lead of their primary team (for a
  lead, the lead of the team above)
- Phone numbers are checked and stored in international form (`+14155550123`), shown on the
  person card as a link to call. Home time zones are checked too, and default to the time zone of
  the person's desk
- An encrypted export of the whole organization, for backups and moving between instances (see
  [Backup and moving instances](#backup-and-moving-instances))
- CSV import with a dry-run diff before anything is written, where rows with errors can be
  skipped. Files saved by Excel (Windows-1252 or UTF-16, separated by commas, semicolons or tabs)
  are detected. CSV export, and an audit log of every admin change, filterable by entity, date and
  admin, and exportable as CSV
- ISO 3166 region codes (`US`, `US-CA`, `CA-ON`), and per-user settings for how regions are
  displayed (optionally with the country's flag, or the flag alone) and how dates are written (ISO, day/month/year or month/day/year, in the user's own
  time zone)
- A semantic theme layer: components are styled only through theme slots, never raw colors
- Admin pages for offices and floors. Each office chooses what its floors are called (Floor,
  Building, Wing, …), and the map and admin pages use that word. Rooms and areas can be renamed,
  and meeting rooms given a seat count, without a new drawing; desks and rooms can be added or
  removed on the drawing itself in the browser, and the result is reviewed and saved as a new
  version, like an upload. A floor or office can be archived (hidden everywhere, history kept),
  or deleted if it never had a drawing Uploading a floor drawing (SVG)
  sanitizes it, shows what it
  adds, moves and removes before anything is saved, and keeps every version for rollback. How to
  draw one is in [`docs/map-authoring.md`](docs/map-authoring.md)
- Meeting rooms on the map show whether they're free, busy, booked soon, or out of date, with a
  color from the theme and a shape for each state, once Phase 4's calendar sync writes their
  status
- Branding: an admin imports the brand's design tokens (from Figma, Penpot or Tokens Studio),
  maps them onto the app's theme slots, checks contrast (including for color-blind viewers),
  previews the directory, map and org chart, and applies the theme with its logo, favicon and
  fonts. Every applied theme is kept for rollback and can be exported. The guide is
  [`docs/theming.md`](docs/theming.md)

Not built yet: Google room status and Calendar
presence (Phase 4) and Slack (Phase 5). The worker is a skeleton
that only logs a heartbeat. See [`plan.md` §12](plan.md#12-delivery-plan) for the roadmap.

## Quickstart

### Prerequisites

- Node.js 22 or later (CI and the Docker image use Node 24)
- pnpm (run `corepack enable` and the version pinned in `package.json` is used)
- Docker, for Postgres and the database tests

### Run it locally

```sh
pnpm install

# Start Postgres 16. This also creates the officeorg_test and officeorg_e2e databases.
pnpm db:up

# Configure the web app. The defaults point at the database from the previous step.
cp .env.example apps/web/.env.local
```

Edit `apps/web/.env.local`. For local development without a real SSO provider, sign in with a
shared dev password using the seeded demo accounts:

```sh
AUTH_SECRET=<a long random string, e.g. from `openssl rand -base64 32`>
COMPANY_DOMAIN=example.com
ADMIN_EMAILS=jane@example.com
AUTH_DEV_PASSWORD=dev
```

Then create the schema, load the demo data and start the app:

```sh
# The database scripts read DATABASE_URL from the shell, not from .env.local.
export DATABASE_URL=postgres://officeorg:officeorg@localhost:5432/officeorg

pnpm db:migrate
pnpm db:seed     # resets the database and loads the demo data
pnpm dev
```

Open <http://localhost:3000> and sign in as `jane@example.com` (admin) or `bob@example.com`
(viewer) with the dev password. The demo data includes Bob → Max → Jane, an HR team with two
sub-teams, a San Francisco office with two floors (Floor 2 has a North and a South Wing), and
Jane based in Ontario (`CA-ON`) with a desk in SF.

`AUTH_DEV_PASSWORD` and `AUTH_DEV_BYPASS_EMAIL` only take effect under `next dev` with a
`localhost` `AUTH_URL`. A production build ignores them. To use real SSO, set `AUTH_PROVIDERS`
and the matching provider variables; `.env.example` documents each one, including the callback
URL to register.

### Commands

| Command               | What it does                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm dev`            | Start the web app in development mode on port 3000                                                    |
| `pnpm build`          | Build every workspace package that has a build step                                                   |
| `pnpm lint`           | ESLint across the repo                                                                                |
| `pnpm typecheck`      | TypeScript checks for every package and the e2e suite                                                 |
| `pnpm test`           | Unit tests (`packages/core`) and database tests (`packages/db`)                                       |
| `pnpm test:e2e`       | Build the app and run the Playwright suite on port 3100                                               |
| `pnpm db:up` / `down` | Start or stop the Postgres container                                                                  |
| `pnpm db:migrate`     | Apply pending migrations                                                                              |
| `pnpm db:seed`        | Reset the database and load the demo data (refuses to run in production)                              |
| `pnpm db:generate`    | Generate a migration after changing `packages/db/schema.ts`                                           |
| `pnpm theme:defaults` | Regenerate `apps/web/app/theme-defaults.css` and `theme/default.tokens.json` from the theme slot list |

### Testing

- **Unit tests** cover the pure domain logic in `packages/core`.
- **Database tests** run against a throwaway Postgres started by Testcontainers, so Docker must
  be running. On macOS with Colima, set
  `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`.
- **End-to-end tests** run a production build against the `officeorg_e2e` database (created by
  `pnpm db:up`) and reseed it before each spec. Install the browser once with
  `pnpm exec playwright install chromium`.

CI (`.github/workflows/ci.yml`) also fails if the schema changed without a migration, if the
theme defaults are out of date, or if a component uses a raw Tailwind palette class such as
`bg-white` instead of a theme slot.

## Project structure

A pnpm workspace with two apps and two shared packages:

```
apps/
  web/          Next.js (App Router) app
    app/
      (app)/      signed-in views: directory, map, org chart, settings
      admin/      people, teams, offices and floors, branding, CSV import, audit log
      api/        Auth.js routes, search, CSV export, brand files, health check
      theme.css/  the active theme as a stylesheet
      login/      sign-in page
    components/   directory, map, org chart, search and admin UI
    lib/          auth config, SSO providers, session helpers, URL state (nuqs)
    proxy.ts      route protection (Next 16's replacement for middleware.ts)
  worker/       long-running background process (heartbeat only for now)
packages/
  core/         pure domain logic with no I/O, unit tested with Vitest
    auth/         sign-in and role policy
    csv/          CSV parsing and validation for people and teams
    directory/    directory model and filtering
    import/       dry-run import planning
    map/          floor map model and the generated state stylesheet
    org/          the org chart's reporting and team trees
    regions/      ISO 3166 validation and display formatting
    search/       search result types and query normalization
    spaces/       office and floor form validation
    svg/          floor drawing sanitize, parse and diff
    teams/        team tree helpers
    theme/        theme slots, design token import, value grammar, contrast checks, CSS
  db/           Drizzle schema, migrations, queries, seed, and database tests
    seed-floors/  sample floor SVGs that the demo data loads
docs/           guides: map-authoring.md for drawing floor SVGs, theming.md for design tokens
theme/          the default theme as a design token file (generated)
e2e/            Playwright specs, one or more per user story
docker/         Postgres init script
Dockerfile      one image with `web` and `worker` targets
plan.md         design and delivery plan, with progress tracking
```

Domain rules (validation, cycle checks, import planning, region formatting) live in
`packages/core` as pure functions. `packages/db` handles persistence, and the web app wires the
two together in server actions. Every admin write runs as a server action that checks the role,
validates with zod, writes in a transaction and records an audit entry.

## Deployment

The `Dockerfile` builds one image with two targets:

```sh
docker build --target web -t officeorg-web .
docker build --target worker -t officeorg-worker .
```

The web container applies migrations on start and then serves on port 3000. It needs
`DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET`, `COMPANY_DOMAIN`, `ADMIN_EMAILS` and the SSO variables
for each provider in `AUTH_PROVIDERS`. `THEME_TOKENS_PATH` optionally names a token file to use
as the theme until an admin applies one (see [`docs/theming.md`](docs/theming.md)). The search uses the `pg_trgm` extension, which a migration
creates, so the database user needs permission to create it (managed Postgres such as Cloud SQL
and RDS allow it). `GET /api/health` is a liveness check. `/theme.css` and
`/api/brand-assets/*` are served without signing in, because the sign-in page uses the theme and
logo. Run one web replica
at a time while a schema change is being deployed, because two replicas migrating at once can
race.

### Backup and moving instances

Admins can download the whole organization as one file under **Admin → Backup**: offices,
floors with every drawing version, areas, rooms and desks, teams, people with their memberships
and accounts, users and their settings, themes and brand files. Ids are kept, so links survive a
move. The file is encrypted with a passphrase the admin chooses (scrypt, then AES-256-GCM), so it
can travel by email or sit on a shared drive; without the passphrase it can't be opened. It
never contains messaging tokens, presence data or the audit log (export that from the audit log
page). Exports and imports are both recorded in the audit log.

To load a file, choose **Merge** (add and update by id; a reused email, slug, desk code or account
is a conflict and blocks the import) or **Replace** (empty this instance's organization data and
load the file: for restoring a backup or setting up a new instance). Each shows what would
change before anything is written. Roles come from the file only if the admin asks, and the
importing admin always stays an admin. A file must come from an instance on the same database
schema version; files from older versions can't be read yet. This complements the database's
own backups and point-in-time recovery; it doesn't replace them.

## Acknowledgements

OfficeOrg is built on open-source work. Thank you to the people who maintain it.

**In use today**

- [Next.js](https://nextjs.org) and [React](https://react.dev): the web app
- [Auth.js](https://authjs.dev): single sign-on with any OIDC provider
- [PostgreSQL](https://www.postgresql.org), [Drizzle ORM](https://orm.drizzle.team) and
  [node-postgres](https://node-postgres.com): the database, schema and migrations
- [Tailwind CSS](https://tailwindcss.com): styling, through semantic theme variables
- [TanStack Table](https://tanstack.com/table): the directory table
- [nuqs](https://nuqs.dev): type-safe URL search params for selection state
- [Zod](https://zod.dev): validation at every boundary
- [CSV for Node.js](https://csv.js.org) (`csv-parse`, `csv-stringify`): CSV import and export
- [`iso-3166`](https://github.com/wooorm/iso-3166) by Titus Wormer: ISO 3166-1 and 3166-2 data
- [`@paralleldrive/cuid2`](https://github.com/paralleldrive/cuid2): URL-safe ids
- [DOMPurify](https://github.com/cure53/DOMPurify), [SVGO](https://svgo.dev) and
  [jsdom](https://github.com/jsdom/jsdom): sanitizing and reading floor drawings
- [react-zoom-pan-pinch](https://github.com/BetterTyped/react-zoom-pan-pinch): zoom and pan on
  the floor map
- [d3-org-chart](https://github.com/bumbeishvili/org-chart) by David Bumbeishvili: the org chart
- [Vitest](https://vitest.dev), [Playwright](https://playwright.dev) and
  [Testcontainers](https://testcontainers.com): unit, end-to-end and database tests
- [pnpm](https://pnpm.io), [TypeScript](https://www.typescriptlang.org),
  [tsx](https://tsx.is), [ESLint](https://eslint.org) and [Prettier](https://prettier.io): tooling

**Planned for later phases**

- [pg-boss](https://github.com/timgit/pg-boss): background jobs in Postgres
- [Slack Bolt](https://tools.slack.dev/bolt-js): Slack Socket Mode
- [shadcn/ui](https://ui.shadcn.com): UI components, whose CSS-variable model the theme slots
  follow

**Design tokens and theming.** The branding work follows the
[W3C Design Tokens Community Group](https://www.designtokens.org) format, so themes can come from
[Figma](https://www.figma.com), [Penpot](https://penpot.app) or
[Tokens Studio](https://tokens.studio) without a parser for each tool.
