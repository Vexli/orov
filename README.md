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

**Phase 1 (Foundation) and Phase 2 (Maps) are complete.** Neither has been released to `main`
yet. The parts that work today:

- Sign-in through any SSO provider Auth.js supports (Google, Microsoft Entra ID, Okta, AWS
  Cognito or any OpenID Connect issuer), limited to one company email domain, with `viewer` and
  `admin` roles
- Directory with search, team and location filters, a person card, and selection kept in the URL
- Floor map: the floor drawing with an avatar at each occupied desk, zoom and pan, and a card for
  the person, desk or room you click. Switch offices and floors, open an area such as the South
  Wing as a zoomed view, and see each floor's headcount, desks and rooms. The map follows a
  selected person to their floor, and highlights a team's seats (optionally with its sub-teams)
  with a count per floor. A desk on a person card links to the map. A List toggle shows the same
  desks and rooms as a table for keyboard and screen reader users
- Admin pages to create, edit and deactivate people and teams, with checks that reject
  manager and parent-team cycles. Desks are assigned by clicking the floor drawing; choosing a
  taken desk swaps it, after the admin confirms
- CSV import with a dry-run diff before anything is written, CSV export, and an audit log of
  every admin change
- ISO 3166 region codes (`US`, `US-CA`, `CA-ON`), and a per-user setting for how regions are
  displayed
- A semantic theme layer: components are styled only through theme slots, never raw colors
- Admin pages for offices and floors. Uploading a floor drawing (SVG) sanitizes it, shows what it
  adds, moves and removes before anything is saved, and keeps every version for rollback. How to
  draw one is in [`docs/map-authoring.md`](docs/map-authoring.md)

Not built yet: the org chart (Phase 3), Google room status and Calendar
presence (Phase 4), Slack (Phase 5) and brand token import (Phase 5.5). The worker is a skeleton
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

| Command               | What it does                                                           |
| --------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`            | Start the web app in development mode on port 3000                     |
| `pnpm build`          | Build every workspace package that has a build step                    |
| `pnpm lint`           | ESLint across the repo                                                 |
| `pnpm typecheck`      | TypeScript checks for every package and the e2e suite                  |
| `pnpm test`           | Unit tests (`packages/core`) and database tests (`packages/db`)        |
| `pnpm test:e2e`       | Build the app and run the Playwright suite on port 3100                |
| `pnpm db:up` / `down` | Start or stop the Postgres container                                   |
| `pnpm db:migrate`     | Apply pending migrations                                               |
| `pnpm db:seed`        | Reset the database and load the demo data (refuses to run in production) |
| `pnpm db:generate`    | Generate a migration after changing `packages/db/schema.ts`            |
| `pnpm theme:defaults` | Regenerate `apps/web/app/theme-defaults.css` from the theme slot list  |

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
      (app)/      signed-in views: directory, map, settings
      admin/      people, teams, offices and floors, CSV import, audit log
      api/        Auth.js routes, CSV export, health check
      login/      sign-in page
    components/   directory, map and admin UI
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
    regions/      ISO 3166 validation and display formatting
    spaces/       office and floor form validation
    svg/          floor drawing sanitize, parse and diff
    teams/        team tree helpers
    theme/        semantic theme slots and their defaults
  db/           Drizzle schema, migrations, queries, seed, and database tests
    seed-floors/  sample floor SVGs that the demo data loads
docs/           guides, such as map-authoring.md for drawing floor SVGs
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
for each provider in `AUTH_PROVIDERS`. `GET /api/health` is a liveness check. Run one web replica
at a time while a schema change is being deployed, because two replicas migrating at once can
race.

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
- [Vitest](https://vitest.dev), [Playwright](https://playwright.dev) and
  [Testcontainers](https://testcontainers.com): unit, end-to-end and database tests
- [pnpm](https://pnpm.io), [TypeScript](https://www.typescriptlang.org),
  [tsx](https://tsx.is), [ESLint](https://eslint.org) and [Prettier](https://prettier.io): tooling

**Planned for later phases**

- [d3-org-chart](https://github.com/bumbeishvili/org-chart) by David Bumbeishvili: the org chart
- [pg-boss](https://github.com/timgit/pg-boss): background jobs in Postgres
- [Slack Bolt](https://tools.slack.dev/bolt-js): Slack Socket Mode
- [shadcn/ui](https://ui.shadcn.com): UI components, whose CSS-variable model the theme slots
  follow

**Design tokens and theming.** The branding work follows the
[W3C Design Tokens Community Group](https://www.designtokens.org) format, so themes can come from
[Figma](https://www.figma.com), [Penpot](https://penpot.app) or
[Tokens Studio](https://tokens.studio) without a parser for each tool.
