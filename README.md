# OrOv

OrOv is a self-hosted web app that shows **who works where** in an organization: a people
directory, interactive floor maps, and an org chart, linked so that selecting a person or team in
one view carries over to the others. It replaces the spreadsheets that usually track people,
teams, reporting lines and seat assignments, and becomes the source of truth for them.

It's designed for one organization per deployment, with 1–3 offices and up to about 250 people. It
signs people in through the organization's own SSO, and an admin can restyle it to the brand by
importing design tokens from Figma, Penpot or Tokens Studio, without code changes.

> **Status: 0.1.0, the first public release.** The directory, maps, org chart, admin tools and
> branding are complete. Connections to chat, calendar and room-booking tools are designed and
> have a provider-neutral foundation, but no tool is connected yet ([Integrations](#integrations)).

## Features

**Directory and search**

- Search and filter everyone by team and office, with a person card showing their title, teams,
  managers, desk, home region, phone and other accounts (GitHub, GitLab, LinkedIn, a website)
- ⌘K (Ctrl+K) searches people, teams and rooms from any view, with typo tolerance
- The selected person and team are kept in the URL, so switching views or sharing a link keeps
  them

**Floor maps**

- Each floor's SVG drawing with an avatar at every occupied desk and each room's name; zoom, pan,
  and a full-screen mode for phones
- Open an area such as the South Wing as a zoomed view; see each floor's headcount, desks and rooms
- The map follows a selected person to their floor, and highlights a team's seats (with or without
  its sub-teams) with a count per floor
- Meeting rooms can show whether they're free, busy, booked soon, or out of date, with a shape as
  well as a color for each state, once a room provider supplies the status
- A List view shows the same desks and rooms as a table, for keyboard and screen reader users

**Org chart**

- The reporting tree and the team tree, with expand and collapse, zoom, and an outline view
- Centers on the selected person, shows their reporting line, and highlights a team's members
- A person can report to several managers; someone without one reports to their team's lead

**Administration**

- Create, edit and deactivate people and teams, with checks against manager and team cycles; change
  several people at once; record a last working day that only admins see
- Offices and floors: upload a drawing and review what it adds, moves and removes before saving;
  keep every version for rollback; add, move or remove desks and rooms in the browser; archive
- A seating planner that rearranges an office so each team sits together, keeping anyone locked in
  place, and shows every move before applying it
- CSV import with a dry run (rows with errors can be skipped; Excel files in any common encoding
  work) and CSV export
- An audit log of every admin change, filterable and exportable
- An encrypted export of the whole organization, for backups and moving between instances

**Branding and personal settings**

- Import design tokens, map them onto the app's theme, check contrast (including for color-blind
  viewers), preview, and apply with your logo, favicon and fonts; roll back any time. Offices can
  have their own map colors
- Each person chooses how regions are shown (ISO 3166 code, country, region, with or without the
  flag, in 23 languages) and how dates are written, and can edit their own preferred name, phone,
  time zone and accounts on **My profile**

## Integrations

OrOv is designed to connect to three kinds of tool, each chosen per deployment and off by default:

| Capability    | What it adds                                                                               |
| ------------- | ------------------------------------------------------------------------------------------ |
| **Messaging** | Chat with a person or a team's channel, start a group chat, presence from a status channel |
| **Calendar**  | Presence from out-of-office and working-location events                                    |
| **Rooms**     | Live meeting-room status on the map, from a calendar or a room-booking product             |

This release includes the foundation, [`packages/integrations`](packages/integrations): interfaces
that any tool's adapter implements, settings that choose a provider, in-memory fakes, and contract
tests. **No real provider ships yet.** Presence (who's in, working from home or away) is opt-in and
private by default. [`docs/integrations/`](docs/integrations/README.md) explains the architecture
and how to add a provider for your tools.

## Quickstart

### Prerequisites

- Node.js 22 or later (CI and the Docker image use Node 24)
- pnpm (run `corepack enable` and the version pinned in `package.json` is used)
- Docker, for Postgres and the database tests

### Run it locally

```sh
pnpm install

# Start Postgres 16. This also creates the orov_test and orov_e2e databases.
pnpm db:up

# Configure the web app. The defaults point at the database from the previous step.
cp .env.example apps/web/.env.local
```

Edit `apps/web/.env.local`. For local development without a real SSO provider, sign in with a
shared dev password:

```sh
AUTH_SECRET=<a long random string, e.g. from `openssl rand -base64 32`>
COMPANY_DOMAIN=example.com
ADMIN_EMAILS=you@example.com
AUTH_DEV_PASSWORD=dev
```

Then create the schema and start the app:

```sh
# The database scripts read DATABASE_URL from the shell, not from .env.local.
export DATABASE_URL=postgres://orov:orov@localhost:5432/orov

pnpm db:migrate
pnpm dev
```

Open <http://localhost:3000> and sign in as `you@example.com` with the dev password. A new
install is empty: each view shows an admin how to set it up (add offices and upload floor
drawings, import people and teams), or you can load the demo organization below.

`AUTH_DEV_PASSWORD` and `AUTH_DEV_BYPASS_EMAIL` only take effect under `next dev` with a
`localhost` `AUTH_URL`. A production build ignores them. To use real SSO, set `AUTH_PROVIDERS`
and the matching provider variables; [`docs/configuration.md`](docs/configuration.md) documents
every setting, including the callback URL to register.

### Try the demo

[`demo/orov-demo.json`](demo/orov-demo.json) is a fictional organization to explore: about 115
people in San Francisco, London and Berlin, six floors (called Floors, Levels and Buildings), a
team tree four levels deep, people with two managers, people without a desk or working remotely,
people who have left, profile links, one office with its own map colors, and a theme.

- **Into any instance:** sign in as an admin, open **Admin → Backup**, choose **Replace**, and
  upload the file with the passphrase `orov-demo-data`. This removes the instance's current
  organization, so use it on a new or test instance.
- **Locally:** `pnpm db:seed` resets the database in `DATABASE_URL` and loads the demo.

Everyone in it has an `example.com` address, so with `COMPANY_DOMAIN=example.com` and the dev
password you can sign in as anyone, for example `santiago.bergstrom@example.com` (an admin in the
demo) or `aiko.nakamura@example.com` (a viewer). Roll the demo's theme back on the Branding page.

### Commands

| Command               | What it does                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm dev`            | Start the web app in development mode on port 3000                                                    |
| `pnpm build`          | Build every workspace package that has a build step                                                   |
| `pnpm lint`           | ESLint across the repo                                                                                |
| `pnpm typecheck`      | TypeScript checks for every package and the e2e suite                                                 |
| `pnpm test`           | Unit tests (`packages/core`, `packages/integrations`) and database tests (`packages/db`)              |
| `pnpm test:e2e`       | Build the app and run the Playwright suite on port 3100                                               |
| `pnpm db:up` / `down` | Start or stop the Postgres container                                                                  |
| `pnpm db:migrate`     | Apply pending migrations                                                                              |
| `pnpm db:seed`        | Reset the database and load the demo organization (refuses to run in production)                      |
| `pnpm demo:build`     | Rebuild `demo/orov-demo.json` in a throwaway Postgres (Docker); needed after every migration          |
| `pnpm db:generate`    | Generate a migration after changing `packages/db/schema.ts`                                           |
| `pnpm theme:defaults` | Regenerate `apps/web/app/theme-defaults.css` and `theme/default.tokens.json` from the theme slot list |

### Testing

- **Unit tests** cover the pure domain logic in `packages/core` and the integration registry,
  fakes and contracts in `packages/integrations`.
- **Database tests** run against a throwaway Postgres started by Testcontainers, so Docker must
  be running. On macOS with Colima, set
  `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`.
- **End-to-end tests** run a production build against the `orov_e2e` database (created by
  `pnpm db:up`) and reload the test fixture before each spec. Install the browser once with
  `pnpm exec playwright install chromium`.

CI (`.github/workflows/ci.yml`) also fails if the schema changed without a migration, if the
theme defaults are out of date, if a component uses a raw Tailwind palette class such as
`bg-white` instead of a theme slot, or if a chat, calendar or booking vendor is named outside an
integration provider's folder.

## Documentation

| Read                                                | For                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| [`docs/architecture.md`](docs/architecture.md)      | How the system fits together, for anyone changing it               |
| [`docs/configuration.md`](docs/configuration.md)    | Every setting, with defaults                                       |
| [`docs/adapting.md`](docs/adapting.md)              | Setting up an instance for your organization, and what needs code  |
| [`docs/map-authoring.md`](docs/map-authoring.md)    | Drawing floor plans                                                |
| [`docs/theming.md`](docs/theming.md)                | Design tokens and the Branding page, for designers and admins      |
| [`docs/integrations/`](docs/integrations/README.md) | Integration architecture and adding a provider                     |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                | Workflow, conventions and checks                                   |
| [`plan.md`](plan.md)                                | The full design, the roadmap, and progress notes for every feature |
| [`CHANGELOG.md`](CHANGELOG.md)                      | Releases, and upgrade notes                                        |

## Project structure

A pnpm workspace with two apps and three shared packages:

```
apps/
  web/          Next.js (App Router) app
    app/
      (app)/      signed-in views: directory, map, org chart, settings, profile
      admin/      people, teams, offices and floors, seating, branding, import, backup, audit log
      api/        Better Auth routes, search, regions, CSV export, backup, brand files, health check
      theme.css/  the active theme as a stylesheet
      login/      sign-in page
    components/   directory, map, org chart, search and admin UI
    lib/          auth config, SSO providers, session helpers, URL state (nuqs), theme
    proxy.ts      route protection (Next 16's replacement for middleware.ts)
  worker/       long-running background process (checks integration settings, logs a heartbeat)
packages/
  core/         pure domain logic with no I/O, unit tested with Vitest
  db/           Drizzle schema, migrations, queries, and database tests
    demo/         the demo organization's generator (pnpm demo:build) and loader (pnpm db:seed)
    test-fixture.ts, test-floors/  the small fixed organization the tests run against
  integrations/ provider interfaces, registry, fakes and contract tests for chat, calendar, rooms
demo/           orov-demo.json, the demo organization as a backup file
docs/           guides (see Documentation above)
theme/          the default theme as a design token file (generated)
e2e/            Playwright specs, one or more per user story
docker/         Postgres init script
Dockerfile      one image with `web` and `worker` targets
plan.md         design and delivery plan, with progress tracking
```

Domain rules (validation, cycle checks, import planning, region formatting) live in
`packages/core` as pure functions. `packages/db` handles persistence, and the web app wires the
two together in server actions. Every admin write runs as a server action that checks the role,
validates with zod, writes in a transaction and records an audit entry. More in
[`docs/architecture.md`](docs/architecture.md).

## Deployment

The `Dockerfile` builds one image with two targets:

```sh
docker build --target web -t orov-web .
docker build --target worker -t orov-worker .
```

The web container applies migrations on start and then serves on port 3000. It needs
`DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET`, `COMPANY_DOMAIN`, `ADMIN_EMAILS` and the SSO variables
for each provider in `AUTH_PROVIDERS` ([`docs/configuration.md`](docs/configuration.md)).
`THEME_TOKENS_PATH` optionally names a token file to use as the theme until an admin applies one
(see [`docs/theming.md`](docs/theming.md)). The search uses the `pg_trgm` extension, which a
migration creates, so the database user needs permission to create it (managed Postgres such as
Cloud SQL and RDS allow it). `GET /api/health` is a liveness check. `/theme.css` and
`/api/brand-assets/*` are served without signing in, because the sign-in page uses the theme and
logo. Run one web replica at a time while a schema change is being deployed, because two replicas
migrating at once can race.

The worker container needs no settings until an integration is configured. It exits at startup if
an integration setting names an unknown provider.

### Backup and moving instances

Admins can download the whole organization as one file under **Admin → Backup**: offices,
floors with every drawing version, areas, rooms and desks, teams, people with their memberships
and accounts, users and their settings, themes and brand files. Ids are kept, so links survive a
move. The file is encrypted with a passphrase the admin chooses (scrypt, then AES-256-GCM), so it
can travel by email or sit on a shared drive; without the passphrase it can't be opened. It
never contains sign-in sessions, messaging tokens, presence data or the audit log (export that from the audit log
page). Exports and imports are both recorded in the audit log.

To load a file, choose **Merge** (add and update by id; a reused email, slug, desk code or account
is a conflict and blocks the import) or **Replace** (empty this instance's organization data and
load the file: for restoring a backup or setting up a new instance). Each shows what would
change before anything is written. Roles come from the file only if the admin asks, and the
importing admin always stays an admin. A file must come from an instance on the same database
schema version; files from older versions can't be read yet. This complements the database's
own backups and point-in-time recovery; it doesn't replace them.

Upgrading from a checkout made before the project was renamed from OfficeOrg? See
[`CHANGELOG.md`](CHANGELOG.md#upgrading-from-a-pre-release-checkout).

## Contributing

Contributions are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md), and report security
issues privately as described in [`SECURITY.md`](SECURITY.md).

## License

[MIT No Attribution](LICENSE.md). Dependencies keep their own licenses.

## Acknowledgements

OrOv is built on open-source work. Thank you to the people who maintain it.

**In use today**

- [Next.js](https://nextjs.org) and [React](https://react.dev): the web app
- [Better Auth](https://www.better-auth.com): single sign-on with any OIDC provider, and sessions
- [PostgreSQL](https://www.postgresql.org), [Drizzle ORM](https://orm.drizzle.team) and
  [node-postgres](https://node-postgres.com): the database, schema and migrations
- [Tailwind CSS](https://tailwindcss.com): styling, through semantic theme variables
- [TanStack Table](https://tanstack.com/table): the directory table
- [nuqs](https://nuqs.dev): type-safe URL search params for selection state
- [Zod](https://zod.dev): validation at every boundary
- [CSV for Node.js](https://csv.js.org) (`csv-parse`, `csv-stringify`): CSV import and export
- [`iso-3166`](https://github.com/wooorm/iso-3166) by Titus Wormer: ISO 3166-1 and 3166-2 data
- [libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js): phone number checks
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

**Planned**

- [pg-boss](https://github.com/timgit/pg-boss): background jobs in Postgres
- [shadcn/ui](https://ui.shadcn.com): UI components, whose CSS-variable model the theme slots
  follow

**Design tokens and theming.** The branding work follows the
[W3C Design Tokens Community Group](https://www.designtokens.org) format, so themes can come from
[Figma](https://www.figma.com), [Penpot](https://penpot.app) or
[Tokens Studio](https://tokens.studio) without a parser for each tool.
