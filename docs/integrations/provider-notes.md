# Provider notes (research, not decisions)

What is known about tools OrOv might connect to, gathered while the original design was written
around one chat tool and one calendar suite. **None of this is verified**: no spike has run (see
[`plan.md` §2](../../plan.md#2-integration-spikes)), APIs and scopes change, and nothing here
commits the project to a vendor. Treat each entry as a list of things to check. When a spike runs,
record what it found under the tool's heading: real payloads, the scopes that were actually needed,
and surprises.

The architecture every provider fits into is in [`README.md`](README.md).

## Messaging

### Slack

- **Matching:** `users.lookupByEmail` (bot scopes `users:read`, `users:read.email`). User ids look
  like `U…` or `W…`.
- **Links without an API call:** `slack://user?team=<T>&id=<U>` and
  `slack://channel?team=<T>&id=<C>`, with `https://app.slack.com/client/<T>/<U or C>` as the web
  fallback. Needs the workspace id (`T…`) as a setting.
- **Group chat:** `conversations.open users=…` with a **user** token (OAuth v2 user scopes
  `im:write`, `mpim:write`), then the `slack://channel` link to the returned id. A group DM holds at
  most 9 people including the viewer, so `maxGroupSize` would be 8.
- **Status channel:** `conversations.history` for backfill (`channels:history`, `channels:read`).
  Live events through Socket Mode (Bolt, an app-level token with `connections:write`), which needs
  no public URL; the Events API is the webhook alternative. Handle the `message_changed` and
  `message_deleted` subtypes. The message `ts` is the stable `ref`.
- **Reactions:** `reactions:add` (`reactions:write`); emoji are named (`house`), not Unicode.
- **Spike to run:** a test user token opening a group DM in the desktop client; more than 95% of
  staff emails matching; 60 days of a real status channel's history to seed the keyword rules.

### Microsoft Teams (Microsoft Graph)

- Chat deep links (`https://teams.microsoft.com/l/chat/0/0?users=<upn1>,<upn2>`) open a 1:1 or
  group chat without an API call or a per-user token, so `openGroupChat` may not need OAuth at all.
  Check the group size limit and the behaviour in the desktop client.
- Matching by email through Graph `users` (application permission `User.Read.All`).
- A status channel would be read through Graph channel messages; live events need change
  notifications, which are webhooks and need a public URL.

### Google Chat, Mattermost, Discord

Not researched. For each, check: lookup by email, deep links to a person and a channel, group-chat
creation and its size limit, reading a channel's history, live events without a public URL, and
reactions.

## Calendar

### Google Workspace (Calendar API)

- Reading other people's calendars needs a service account with **domain-wide delegation**,
  impersonating each person. Workspace admins may be reluctant to grant it; ask early with the
  exact scope list.
- `events.list` with `eventTypes=outOfOffice` and `eventTypes=workingLocation` (scope
  `calendar.events.readonly`). `workingLocationProperties.type` is `homeOffice`,
  `officeLocation` or `customLocation`, which map to `home`, `office` and `other`.
- About 250 calls an hour for 250 people, well within quota.
- **Spike to run:** impersonate 3–5 volunteers and confirm both event types come back and home is
  distinguishable from office.

### Microsoft 365 (Microsoft Graph)

- Out of office from `mailboxSettings.automaticRepliesSetting` or `calendarView` events marked
  `showAs: oof`; working location from the work-hours-and-location settings. Application
  permissions (`Calendars.Read`, `MailboxSettings.Read`) need admin consent. Verify both.

## Rooms

### Google Workspace

- Room directory: `admin.directory.resources.calendars.list`, impersonating an admin (scope
  `admin.directory.resource.calendar.readonly`). Rooms carry `buildingId`, `floorName` and
  `floorSection`, which map to `buildingId`, `floorName` and `section` in `RoomResource`.
- Busy times: `freebusy.query`, up to 50 calendars per call (scope `calendar.freebusy`).
- If domain-wide delegation is refused, rooms can still work with one delegated user who can see
  the room calendars.

### Microsoft 365

- Room directory: Graph `places/microsoft.graph.room` (`Place.Read.All`), with building and floor
  fields. Busy times: `calendar/getSchedule` for room addresses.

### Booking products (Robin, Skedda, Envoy, and similar)

- Likely status-only providers (`capabilities.directory` false) unless their API lists rooms with
  stable ids. Check the API's availability on the plan the organization has, its rate limits, and
  whether it exposes bookings for a time window.
