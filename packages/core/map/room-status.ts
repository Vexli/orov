// What the map shows for a meeting room or phone booth (plan.md §8.1, U5). The worker writes
// free, busy or soon to room_status; a status the worker hasn't refreshed for five minutes is
// shown as stale rather than trusted.

export type RoomState = "free" | "busy" | "soon";
export type RoomDisplayState = RoomState | "stale";

export const ROOM_STATUS_STALE_MS = 5 * 60 * 1000;

export const ROOM_STATE_LABEL: Record<RoomDisplayState, string> = {
  free: "Free now",
  busy: "Busy now",
  soon: "Free now, booked within 15 minutes",
  stale: "Status out of date",
};

// Null when the room has no status at all, such as a room not linked to a calendar.
export function roomDisplayState(
  status: { state: RoomState; checkedAt: Date } | undefined,
  now: Date,
): RoomDisplayState | null {
  if (!status) return null;
  return now.getTime() - status.checkedAt.getTime() > ROOM_STATUS_STALE_MS ? "stale" : status.state;
}
