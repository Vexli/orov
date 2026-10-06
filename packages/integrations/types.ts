// Vendor-neutral shapes that providers return (docs/integrations/README.md). Adapters translate a
// tool's payloads into these and report facts only: what a calendar event or chat message says,
// never which presence status it means. Turning facts into a status is core policy (plan.md §8.4),
// shared by every provider.

// A user account in the messaging tool.
export interface ExternalUser {
  // The provider's own user id, in the form its normalizeUserId accepts.
  externalId: string;
  email: string;
  displayName?: string;
  title?: string;
  photoUrl?: string;
}

// Where a chat link opens. `web` always works in a browser; `app` is a deep link into the desktop
// or mobile client, tried first when present.
export interface ChatLink {
  web: string;
  app?: string;
}

// A message in a status channel, for presence keywords (plan.md §8.3).
export interface StatusMessage {
  channelId: string;
  // Unique within the channel and stable across edits: it becomes presence_signal.source_ref.
  ref: string;
  authorId: string;
  text: string;
  postedAt: Date;
  editedAt?: Date;
  // Set for replies in a thread, which the rules ignore unless a setting turns them on.
  threadRef?: string;
}

// A live change in a status channel. An edit or deletion updates or retracts the signal.
export type StatusMessageEvent =
  | { type: "posted"; message: StatusMessage }
  | { type: "edited"; message: StatusMessage }
  | { type: "deleted"; channelId: string; ref: string };

export type WorkingLocation = "home" | "office" | "other";

// A calendar entry that says something about where someone is (plan.md §8.2).
export type CalendarPresenceEvent = {
  // Stable id of the event (or occurrence): it becomes presence_signal.source_ref.
  ref: string;
  email: string;
  start: Date;
  end: Date;
  title?: string;
} & ({ kind: "out_of_office" } | { kind: "working_location"; location: WorkingLocation });

// A bookable room as the room provider lists it, for the room import diff (plan.md §8.1).
export interface RoomResource {
  // Stored as space.calendar_resource_id once an admin links the room to the drawing.
  resourceId: string;
  name: string;
  capacity?: number;
  // Matched against location.external_building_id.
  buildingId?: string;
  floorName?: string;
  section?: string;
}

export interface BusyBlock {
  start: Date;
  end: Date;
}
