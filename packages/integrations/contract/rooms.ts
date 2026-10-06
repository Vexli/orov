// The behaviour every RoomProvider must have. See contract/messaging.ts for how it's used.

import { describe, expect, it } from "vitest";
import type { RoomProvider } from "../rooms";

export interface RoomContractSetup {
  make: () => RoomProvider | Promise<RoomProvider>;
  // A room the provider knows, with at least one booking in [from, to).
  bookedResourceId: string;
  from: Date;
  to: Date;
}

export function roomContract(name: string, setup: RoomContractSetup) {
  describe(`${name}: RoomProvider contract`, () => {
    it("has a lowercase id and declares exactly the optional methods it has", async () => {
      const p = await setup.make();
      expect(p.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(p.id).not.toBe("none");
      expect(p.capabilities.directory).toBe(typeof p.listRooms === "function");
      expect(p.maxResourcesPerCall).toBeGreaterThanOrEqual(1);
    });

    it("returns sorted busy blocks clipped to the window", async () => {
      const p = await setup.make();
      const result = await p.freeBusy([setup.bookedResourceId], setup.from, setup.to);
      const blocks = result.get(setup.bookedResourceId);
      expect(blocks?.length).toBeGreaterThan(0);
      let previous = -Infinity;
      for (const b of blocks!) {
        expect(b.start.getTime()).toBeLessThan(b.end.getTime());
        expect(b.start.getTime()).toBeGreaterThanOrEqual(setup.from.getTime());
        expect(b.end.getTime()).toBeLessThanOrEqual(setup.to.getTime());
        expect(b.start.getTime()).toBeGreaterThanOrEqual(previous);
        previous = b.start.getTime();
      }
    });

    it("leaves out a room it doesn't know instead of throwing", async () => {
      const p = await setup.make();
      const result = await p.freeBusy(
        [setup.bookedResourceId, "no-such-room"],
        setup.from,
        setup.to,
      );
      expect(result.has("no-such-room")).toBe(false);
      expect(result.has(setup.bookedResourceId)).toBe(true);
      expect(await p.freeBusy([], setup.from, setup.to)).toEqual(new Map());
    });

    it("has no busy blocks in an empty window", async () => {
      const p = await setup.make();
      const result = await p.freeBusy([setup.bookedResourceId], setup.from, setup.from);
      expect(result.get(setup.bookedResourceId) ?? []).toEqual([]);
    });

    it("lists rooms with unique resource ids and names", async () => {
      const p = await setup.make();
      if (!p.listRooms) return;
      const rooms = await p.listRooms();
      expect(rooms.map((r) => r.resourceId)).toContain(setup.bookedResourceId);
      expect(new Set(rooms.map((r) => r.resourceId)).size).toBe(rooms.length);
      for (const room of rooms) expect(room.name.trim()).not.toBe("");
    });
  });
}
