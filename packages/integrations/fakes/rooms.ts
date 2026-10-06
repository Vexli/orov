import type { RoomCapabilities, RoomProvider } from "../rooms";
import type { BusyBlock, RoomResource } from "../types";
import { DEMO_ROOMS } from "./demo";

const MINUTE_MS = 60 * 1000;

export interface FakeRoomsOptions {
  rooms?: readonly RoomResource[];
  // Bookings per resource id. Defaults to demoBookings(now()).
  bookings?: ReadonlyMap<string, readonly BusyBlock[]>;
  now?: () => Date;
}

// One room in each state the map shows, relative to `now`: the Boardroom is busy, Huddle A is
// booked in 10 minutes (soon), the Workshop later today, and the phone booths are free.
export function demoBookings(now: Date): Map<string, BusyBlock[]> {
  const at = (minutes: number) => new Date(now.getTime() + minutes * MINUTE_MS);
  return new Map([
    ["boardroom@rooms.invalid", [{ start: at(-15), end: at(30) }]],
    ["huddle-a@rooms.invalid", [{ start: at(10), end: at(40) }]],
    ["workshop@rooms.invalid", [{ start: at(120), end: at(180) }]],
  ]);
}

// An in-memory room directory and booking calendar for tests and offline development.
export class FakeRooms implements RoomProvider {
  readonly id = "fake";
  readonly label = "Fake rooms";
  readonly capabilities: RoomCapabilities = { directory: true };
  readonly maxResourcesPerCall = 50;

  private readonly rooms: readonly RoomResource[];
  private readonly bookings: ReadonlyMap<string, readonly BusyBlock[]>;

  constructor(options: FakeRoomsOptions = {}) {
    this.rooms = options.rooms ?? DEMO_ROOMS;
    this.bookings = options.bookings ?? demoBookings((options.now ?? (() => new Date()))());
  }

  async listRooms(): Promise<RoomResource[]> {
    return this.rooms.map((r) => ({ ...r }));
  }

  async freeBusy(resourceIds: string[], from: Date, to: Date): Promise<Map<string, BusyBlock[]>> {
    if (resourceIds.length > this.maxResourcesPerCall) {
      throw new Error(`At most ${this.maxResourcesPerCall} rooms per call`);
    }
    const known = new Set(this.rooms.map((r) => r.resourceId));
    const result = new Map<string, BusyBlock[]>();
    for (const id of resourceIds) {
      if (!known.has(id)) continue;
      if (from >= to) {
        result.set(id, []);
        continue;
      }
      const blocks = (this.bookings.get(id) ?? [])
        .filter((b) => b.start < to && b.end > from)
        .map((b) => ({ start: b.start < from ? from : b.start, end: b.end > to ? to : b.end }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      result.set(id, blocks);
    }
    return result;
  }
}
