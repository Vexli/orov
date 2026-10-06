# Integrations: architecture and how to add a provider

OrOv can show live data from three kinds of outside tool: a **messaging** tool (chat links, group
chats, a status channel), a **calendar** (out-of-office and working-location events), and a
**room** system (meeting-room busy times, from a calendar or a booking product). This guide is for
anyone building that support: how the pieces fit, the rules every provider follows, and the steps
to add one.

> **Status.** No real provider ships yet. What exists is the provider-neutral foundation in
> [`packages/integrations`](../../packages/integrations): the interfaces, the registry that picks a
> provider from the environment, in-memory fakes, and contract test suites. The database tables the
> integrations write to exist too, and the map already draws room status from them. Which tools to
> support first hasn't been decided; [`provider-notes.md`](provider-notes.md) collects what is known
> about the candidates.

## The three capabilities

They are separate on purpose. One organization might use one vendor's chat with another vendor's
calendar and a third-party booking tool for rooms, so each is configured on its own.

| Capability    | What users get                                                                                                                          | Interface           | Setting              | Writes to                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------- | ---------------------------------------------------------------------------- |
| **Messaging** | Chat with a person, open a team's channel, start a group chat (U7); presence from a status channel (U8); photos and titles (Phase 7 #3) | `MessagingProvider` | `MESSAGING_PROVIDER` | `person_identity`, `messaging_user_token`, `presence_signal`                 |
| **Calendar**  | Presence from out-of-office and working-location events (U8)                                                                            | `CalendarProvider`  | `CALENDAR_PROVIDER`  | `presence_signal`                                                            |
| **Rooms**     | Free, busy and "booked soon" on the map (U5); importing rooms                                                                           | `RoomProvider`      | `ROOMS_PROVIDER`     | `room_status`, `space.calendar_resource_id`, `location.external_building_id` |

Each setting is a provider id or `none`, the default. `INTEGRATIONS=fake` sets all three to the
in-memory fakes for offline development and tests. See [Configuration](#configuration).

## Design rules

These hold for every provider. Review a new adapter against them.

1. **The web app reads only OrOv's own tables.** Worker jobs call providers on a schedule,
   normalize what they get, and upsert it into `room_status`, `presence_signal` and
   `person_identity`. A page load never waits on an outside API, and an outage of the tool shows
   up as stale data, not a broken page. The one exception is opening a group chat, which the
   viewer starts and which has to act as them.
2. **Adapters report facts; core decides what they mean.** A calendar adapter returns "an
   out-of-office event from 09:00 to 17:00" or "working location: home", never a presence status.
   A messaging adapter returns the text of a message, not "this means WFH". Turning facts into a
   status (keyword rules, precedence, privacy masking; [`plan.md` §8.3–§8.4](../../plan.md#8-integrations))
   is pure code in `packages/core`, written once and shared by every provider.
3. **Capabilities, not vendors, drive behaviour.** Every optional ability is an optional method
   plus a flag in `capabilities` (`groupChat`, `profiles`, `statusHistory`, `liveEvents`,
   `reactions`; `outOfOffice`, `workingLocation`; `directory`). The contract suites check that flag
   and method agree, so the UI shows a "Group chat" button only when `groupChat` is true, and a job
   runs only when its method exists. Nothing outside `providers/<id>/` checks which provider is
   configured.
4. **No provider means `null`, not a stand-in.** With `none` the registry returns `null` and the
   `*Capabilities(null)` helpers return all-false, so the feature disappears. A deployment without
   integrations looks exactly like this release.
5. **Writes are idempotent.** Every signal carries the provider's stable id for its source (a
   message ref, an event id) as `source_ref`, and
   `UNIQUE(provider, source, source_ref, date)` on `presence_signal` makes re-running a job or a
   backfill harmless. An edited message or a moved event updates its row; a deleted one sets
   `retracted_at`.
6. **Stale data is shown as stale.** Room status older than `ROOM_STATUS_STALE_MS` (five minutes,
   `packages/core/map/room-status.ts`) is drawn as "out of date", never as the last known state.
7. **Presence is opt-in and private by default.** Presence jobs do nothing while the
   `presence.display` setting is `off` (the default; [`plan.md` §8.5](../../plan.md#8-integrations)).
   `sick` is health information and is masked as "Away" for viewers. A new provider can't change
   either rule.
8. **Vendor names live in one folder.** A provider's code, SDK and names go in
   `packages/integrations/providers/<id>/`. CI fails if a chat, calendar or booking vendor is named
   anywhere else in `apps/`, `packages/` or `e2e/`.

## How the pieces fit

```
                     ┌──────────────── apps/worker ────────────────┐
  MESSAGING_PROVIDER │ loadIntegrations(env)  ── at startup; exits │
  CALENDAR_PROVIDER ─┤                           on a bad setting  │
  ROOMS_PROVIDER     │ scheduled jobs (pg-boss) ┐                  │
                     │ live listener (optional) ┼─► provider ──► vendor API
                     │        │                 ┘     (facts)      │
                     │        ▼                                    │
                     │ packages/core: rules, resolve, room state   │
                     └────────┬────────────────────────────────────┘
                              │ idempotent upserts, integration_run
                              ▼
                          Postgres:  room_status · presence_signal → presence_day
                                     person_identity · messaging_user_token
                              ▲
                              │ reads only (plus openGroupChat as the viewer)
                     apps/web: map, directory, org chart, person card
```

### Planned jobs

Job names are neutral; each calls the configured provider through its interface.

| Job                          | Schedule (planned)                                                           | Provider call                                                | Result                                                        |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `rooms:status`               | Every 60 s in office hours (each office's time zone), every 10 min otherwise | `RoomProvider.freeBusy`, in batches of `maxResourcesPerCall` | `room_status` (`free`, `busy`, `soon` = booked within 15 min) |
| `presence:calendar`          | Hourly, plus once at 07:00 local time                                        | `CalendarProvider.presenceEvents`, today to +7 days          | `presence_signal` rows; vanished events retracted             |
| `presence:messages-backfill` | On start, then every 15 min, for the last 48 h                               | `MessagingProvider.statusHistory`                            | `presence_signal` rows (catches what the listener missed)     |
| live listener                | Always on, when `capabilities.liveEvents`                                    | `MessagingProvider.listen`                                   | `presence_signal` rows; `react` to acknowledge a match        |
| `messaging:match-users`      | Nightly, plus an admin button with a diff                                    | `MessagingProvider.matchUsers`                               | `person_identity` rows under the provider's id                |
| `profiles:sync`              | Nightly, when `capabilities.profiles`                                        | `MessagingProvider.listProfiles`                             | Photos (and, if enabled, titles) (Phase 7 #3)                 |

Each run records its start, end, success and counts in `integration_run`, which an Integrations
admin page will show with "Run now" buttons.

A live listener should use an outbound connection when the tool offers one (a socket the worker
opens), so OrOv needs no public URL and can stay behind a VPN. A tool that only offers webhooks
needs an HTTP route in the web app that verifies the request's signature and hands the event to the
same code the listener uses.

### Identity

People are matched to their account in the messaging tool by email. The result is a
`person_identity` row whose `provider` is the messaging provider's id (`MESSAGING_PROVIDER`) and
whose `value` passes that provider's `normalizeUserId`. Core's identity registry
(`packages/core/people/identities.ts`) lists only profile links such as GitHub. Admin forms and CSV
imports never write messaging ids, and saves leave them alone. People the tool doesn't know appear
in an "unmatched" list for an admin to fill in.

Rooms are matched by `space.calendar_resource_id`, and offices by
`location.external_building_id`. With `capabilities.directory`, an admin imports the provider's
rooms through a diff and links each one to its `room-*` element on the drawing. Without it, the
admin types the room's id.

### Group chats and per-user tokens

Starting a group chat must act as the viewer, so it needs their own token. The first time, the
viewer connects their account through the tool's OAuth flow. The token is stored encrypted in
`messaging_user_token` (one row per person and provider), with AES-256-GCM under a key from the
`TOKEN_ENC_KEY` secret, in the same way the backup export encrypts with
`packages/core/backup/crypto.ts`. The provider's `maxGroupSize` limits the selection tray.

## Configuration

| Variable             | Values                                             | Default |
| -------------------- | -------------------------------------------------- | ------- |
| `MESSAGING_PROVIDER` | a messaging provider id, or `none`                 | `none`  |
| `CALENDAR_PROVIDER`  | a calendar provider id, or `none`                  | `none`  |
| `ROOMS_PROVIDER`     | a room provider id, or `none`                      | `none`  |
| `INTEGRATIONS`       | `fake`, or unset. `fake` overrides the three above | unset   |

Ids are case-insensitive. An unknown id, or a provider whose own settings are missing, stops the
worker at startup with a message naming the variable and the valid ids. Today the only id besides
`none` is `fake`.

A provider's own settings use its id as a prefix (an `acme` provider reads `ACME_*`), are listed in
[`.env.example`](../../.env.example) and [`docs/configuration.md`](../configuration.md), and are
checked in its factory with `requireEnv`. Credentials come from the host's secret store, never the
repository. Ask for the narrowest read-only scopes that work; group chats are the only write.

## Adding a provider

1. **Spike first.** With real access, check every assumption the interface makes about the tool,
   using the questions for that capability in [`plan.md` §2](../../plan.md#2-integration-spikes).
   Record the answers, including real payloads to use as fixtures, in
   [`provider-notes.md`](provider-notes.md).
2. **Create `packages/integrations/providers/<id>/`.** The id is lowercase letters, digits and
   hyphens. It becomes the setting's value and the `provider` stored in the database, so pick it
   once. Implement the interface, with its `capabilities` set to exactly the optional methods you
   implement. Translate payloads into the types in `types.ts`, with zod at the boundary; reject
   what you don't understand rather than guessing.
3. **Test it without the network.** Run the capability's contract suite
   (`contract/messaging.ts`, `contract/calendar.ts` or `contract/rooms.ts`) against the adapter
   with recorded responses, and add tests for its own mapping (pagination, time zones, edited and
   deleted items, rate-limit responses).
4. **Register it.** Add a factory to `PROVIDERS` in `registry.ts` that calls `requireEnv` for its
   settings.
5. **Document it.** Add its settings to `.env.example` and `docs/configuration.md`, and write the
   setup steps an administrator of the tool follows (app registration, scopes, which channel)
   under `docs/integrations/`.
6. **Track it.** Add an entry under the matching phase in [`plan.md`](../../plan.md), following
   the progress format in [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

The jobs, admin pages and UI are shared by every provider and are built once, against the fakes.
A new provider should need no change outside its own folder, the registry, and the docs. If it
does, the interface is missing something: change the interface, its contract suite and the fakes
together, in their own commit.

## What can be built before any provider is chosen

Most of the remaining work doesn't depend on a vendor, and can be built and tested now with
`INTEGRATIONS=fake`:

- the `app_setting` table and the `presence.display` setting, with the Presence admin page
- `core/presence`: keyword rules over message text and resolving signals into a day's status
  (pure functions)
- the presence display modes in the directory, map and org chart
- `deriveRoomState(busyBlocks, now)` in `core/map/room-status.ts`, the `rooms:status` job,
  `/api/rooms/status` and polling on the map
- the room import diff and the room ↔ drawing linking UI
- the selection tray for group chats, and chat buttons on the person card, driven by capabilities
- pg-boss in the worker, `integration_run` bookkeeping, and the Integrations admin page

[`plan.md`](../../plan.md) Phases 4 and 5 list these as "provider-independent" items. The
per-provider items stay blocked until a tool is chosen and access is granted.
