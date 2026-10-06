import type { BusyBlock, RoomResource } from "./types";

export interface RoomCapabilities {
  // listRooms: the room import diff. A booking tool that only reports busy times has no
  // directory, and admins enter each room's resource id by hand instead.
  directory: boolean;
}

export interface RoomProvider {
  // The value of ROOMS_PROVIDER.
  readonly id: string;
  readonly label: string;
  readonly capabilities: RoomCapabilities;
  // How many resource ids one freeBusy call takes; the job splits larger requests.
  readonly maxResourcesPerCall: number;

  // Busy blocks per resource id within [from, to), clipped to the window, sorted by start.
  // A resource with no bookings maps to []. A resource the provider doesn't know is left out of
  // the map rather than throwing, so one unlinked room can't stop the whole floor's status.
  freeBusy(resourceIds: string[], from: Date, to: Date): Promise<Map<string, BusyBlock[]>>;
  listRooms?(): Promise<RoomResource[]>;
}

export const NO_ROOM_CAPABILITIES: RoomCapabilities = { directory: false };

export function roomCapabilities(provider: RoomProvider | null): RoomCapabilities {
  return provider?.capabilities ?? NO_ROOM_CAPABILITIES;
}
