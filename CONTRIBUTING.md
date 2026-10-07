# Contributing to OrOv

Thanks for helping. This guide covers setting up, the workflow the project follows, and the
conventions a change is reviewed against. For how the system fits together, read
[`docs/architecture.md`](docs/architecture.md) first.

By contributing, you agree that your contribution is licensed under the project's license,
[MIT No Attribution](LICENSE.md).

## Setting up

You need Node.js 22 or later, pnpm (`corepack enable` picks up the pinned version), and Docker for
Postgres and the database tests. The [README's Quickstart](README.md#quickstart) gets the app
running; [`docs/configuration.md`](docs/configuration.md) lists every setting.

```sh
pnpm install
pnpm db:up                          # Postgres, plus the orov_test and orov_e2e databases
cp .env.example apps/web/.env.local # then set AUTH_SECRET and AUTH_DEV_PASSWORD
export DATABASE_URL=postgres://orov:orov@localhost:5432/orov
pnpm db:migrate && pnpm db:seed && pnpm dev   # db:seed loads the demo organization
```

`INTEGRATIONS=fake` selects the in-memory chat, calendar and room providers, so integration work
needs no outside accounts. Today only the worker reads it; the web app will once integration
features are wired in.

## Before you open a pull request

Run what CI runs:

```sh
pnpm lint
pnpm typecheck
pnpm test        # unit (core, integrations) and database tests; needs Docker
pnpm test:e2e    # builds the app and runs Playwright on port 3100
```

CI (`.github/workflows/ci.yml`) also fails when:

- **a production dependency has a known high or critical vulnerability** (`pnpm audit --prod
--audit-level=high`). Upgrade it, or override the transitive version in `package.json`.
- **the schema changed without a migration.** Run `pnpm db:generate` and commit the result.
- **the theme defaults are stale.** Run `pnpm theme:defaults` after editing
  `packages/core/theme/slots.ts`, and commit both generated files.
- **a component uses a raw palette class** such as `bg-white`. Use a theme slot class
  (`bg-bg`, `text-muted-fg`, `bg-primary`).
- **a chat, calendar or booking vendor is named** outside
  `packages/integrations/providers/<id>/`. Name the capability instead
  ([`docs/integrations/README.md`](docs/integrations/README.md)).

Workflow actions are pinned to commit SHAs with the version in a comment, and the workflow's token
is read-only. Dependabot proposes dependency and action updates weekly.

On macOS with Colima, the database tests need
`DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`. Install
Playwright's browser once with `pnpm exec playwright install chromium`. Locally, `pnpm test:e2e`
reuses a server already listening on port 3100, so stop any old one after changing code.

## Conventions

- **Domain rules live in `packages/core` as pure functions,** with no database or network access,
  and unit tests. `packages/db` does persistence; the web app wires the two together.
- **Validate with zod at every boundary:** form input, CSV rows, API input, integration payloads.
- **Every admin write is a server action** that calls `requireAdmin()`, validates, writes in one
  transaction, and records an audit entry. Integrity checks (cycles, desk uniqueness) run inside
  that transaction.
- **Style only through theme slots,** never literal colors, so a brand theme restyles everything.
- **Selection state lives in the URL,** through the parsers in `apps/web/lib/url-state.ts`.
- **Keep it accessible.** The map and org chart have List views for keyboard and screen reader
  users; new visual features need an equivalent, and status needs a cue that isn't color alone.
- **Integrations go through `packages/integrations`.** Adapters report facts; meaning lives in
  core. Follow "Adding a provider" in [`docs/integrations/README.md`](docs/integrations/README.md).
- **Match the code around you:** naming, comment density (comments say _why_), and formatting.
  Prettier (`.prettierrc.json`, width 100) formats TypeScript, CSS and Markdown; `plan.md` is
  excluded.

### Migrations

Change `packages/db/schema.ts`, then `pnpm db:generate`. Never edit a migration that has been
applied anywhere; add a new one. drizzle-kit asks interactively when a column might be a rename,
so a rename migration is written by hand, with its snapshot generated from `schema.ts` through
`generateDrizzleJson` from `drizzle-kit/api` (migration `0005` and its notes in `plan.md` Phase 7
#4–6 show the method). Afterwards, `pnpm db:generate` must report no changes. A migration also
changes the backup format's schema version, so exports from before it no longer import; say so in
the change's notes. The demo file is a backup too: run `pnpm demo:build` and commit
`demo/orov-demo.json` with the migration, or a database test fails and says so.

### Test data and demo data

Tests use the small fixed organization in `packages/db/test-fixture.ts` (Bob → Max → Jane, HR, two
San Francisco floors from `test-floors/`). The end-to-end specs depend on its ids, so change it
only together with them. The demo organization is separate: generated by
`packages/db/demo/` (deterministic, so a rebuild changes the file only when the data changes),
exported to `demo/orov-demo.json`, and loaded by `pnpm db:seed`. Change it in
`demo/organization.ts`, then run `pnpm demo:build`.

Migration `0000` (and the snapshots up to `0004`) predates the vendor-neutral schema and names the
tools the project was first designed around. `0005` renamed every such column; the old names
survive only in that history.

## Workflow

The project is planned and tracked in [`plan.md`](plan.md): the design in §1–§11 and the delivery
plan, phase by phase, in §12.

- **Branches:** one per feature, `feature/<name>` (or `fix/<name>`). In a phased project, feature
  branches merge into a phase branch (`phase/<n>-<name>`), and the phase branch into `dev` once the
  phase passes an integration run. `main` is for releases, and only the maintainer merges into it.
- **Commits:** one self-contained change each, building and passing tests on its own. The subject
  is in the imperative mood, under about 72 characters, with a type prefix (`feat:`, `fix:`,
  `docs:`, `test:`, `refactor:`, `chore:`, `merge:`). The body says why, and anything non-obvious
  about the approach.
- **Keep the docs true in the same change.** If a change affects setup, a command, a setting, or
  documented behaviour, update the README and `docs/` in the same commit.
- **Track progress in `plan.md`.** Mark an item `[~] IN PROGRESS` when you start it, and when it
  merges record it like this:

  ```markdown
  - [x] Room import diff
    - **Completed:** 2026-10-07
    - **Branch:** merged from `feature/room-import`
    - **Notes:** Decisions, departures from the design, known limitations, and test counts.
  ```

  Use `[!] BLOCKED` with the reason and what would unblock it. The notes are how the next person
  (or agent) picks up the work, so write down anything that isn't obvious from the code.

## Reporting bugs and security issues

Open an issue with steps to reproduce, what you expected, and what happened. For a vulnerability,
don't open a public issue; follow [`SECURITY.md`](SECURITY.md).
