# Changelog

Notable changes, newest first. The project follows [Semantic Versioning](https://semver.org); while
it is in `0.x`, a minor version can include breaking changes, which are called out here.

## 0.1.0: first public release (unreleased)

The first public version. It is a working directory, floor map and org chart, without any chat,
calendar or room-booking connection.

### Included

- **Directory** with search, team and office filters, a shared person card, and selection kept in
  the URL across the directory, map and org chart. ⌘K (Ctrl+K) searches people, teams and rooms,
  with typo tolerance.
- **Floor maps** from SVG drawings: desks with avatars, rooms, areas you can zoom into, team
  highlights with per-floor counts, a list view for keyboard and screen reader users, full screen on
  phones, and room status display (ready for a room provider to feed it).
- **Org chart** with the reporting tree and the team tree, several managers per person, and an
  outline view.
- **Admin:** people, teams, offices and floors; drawing upload with a review of changes, versions
  and rollback; editing desks and rooms on the drawing; a seating planner; CSV import with a dry run
  and export; an audit log; and encrypted backup and restore.
- **Branding** from design tokens (Figma, Penpot, Tokens Studio) with contrast checks, plus map
  colors per office.
- **Personal settings:** how regions are shown (with flags, in 23 languages), date format, and a
  **My profile** page.
- **Sign-in** through Google, Microsoft Entra ID, Okta, AWS Cognito or any OpenID Connect provider,
  limited to one email domain.
- **Integration foundation:** `packages/integrations`, with provider-neutral interfaces for chat,
  calendar and room tools, settings (`MESSAGING_PROVIDER`, `CALENDAR_PROVIDER`, `ROOMS_PROVIDER`,
  `INTEGRATIONS=fake`), in-memory fakes and contract tests. No real provider yet; see
  [`docs/integrations/`](docs/integrations/README.md).

### Licensing

Released under [MIT No Attribution](LICENSE.md).

### Upgrading from a pre-release checkout

- **Renamed from OfficeOrg (2026-10-05).** Packages are `@orov/*` and the images `orov-web` and
  `orov-worker`. A deployment needs no other change: no table or setting carries the old name, and
  backup files written before the rename (format `officeorg-export`) still import.

  A local checkout from before the rename has its database in the old Compose project, which still
  holds port 5432 and uses the `officeorg` user. Stop it, start the new one and point the env files
  at it:

  ```sh
  docker compose -p <checkout folder name> stop db   # the old project was named after the folder
  pnpm db:up                                         # new project `orov`, user and password `orov`
  # In apps/web/.env.local (and your shell): DATABASE_URL=postgres://orov:orov@localhost:5432/orov
  pnpm db:migrate && pnpm db:seed
  ```

  Without the Compose plugin, use `docker-compose -p <folder> stop db` and `docker-compose up -d db`
  for the first two lines. The old volume (`<folder>_pgdata`) is left alone; remove it with
  `docker volume rm` once you no longer need its data.

- **Vendor-neutral names.** The team CSV column is `chat_channel_id`; files with the older
  `slack_channel_id` header still import. Messaging user ids stored before migration `0005` keep
  their rows in `person_identity`.
- **Backups and schema versions.** A backup file imports only into an instance on the same schema
  version, so take a fresh export after deploying any release with a migration.
