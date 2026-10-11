// The behaviour every CalendarProvider must have. See contract/messaging.ts for how it's used.

import { describe, expect, it } from "vitest";
import type { CalendarProvider } from "../calendar";

export interface CalendarContractSetup {
  make: () => CalendarProvider | Promise<CalendarProvider>;
  // Someone with at least one presence event in [from, to).
  email: string;
  from: Date;
  to: Date;
}

export function calendarContract(name: string, setup: CalendarContractSetup) {
  describe(`${name}: CalendarProvider contract`, () => {
    it("has a lowercase id and reports at least one kind of event", async () => {
      const p = await setup.make();
      expect(p.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(p.id).not.toBe("none");
      expect(p.capabilities.outOfOffice || p.capabilities.workingLocation).toBe(true);
    });

    it("returns only that person's events of the kinds it declares, overlapping the window", async () => {
      const p = await setup.make();
      const events = await p.presenceEvents(setup.email.toUpperCase(), setup.from, setup.to);
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.email.toLowerCase()).toBe(setup.email.toLowerCase());
        expect(e.start.getTime()).toBeLessThan(e.end.getTime());
        expect(e.start.getTime()).toBeLessThan(setup.to.getTime());
        expect(e.end.getTime()).toBeGreaterThan(setup.from.getTime());
        if (e.kind === "out_of_office") expect(p.capabilities.outOfOffice).toBe(true);
        else expect(p.capabilities.workingLocation).toBe(true);
      }
      expect(new Set(events.map((e) => e.ref)).size).toBe(events.length);
    });

    it("returns nothing for a window with no events, or an empty window", async () => {
      const p = await setup.make();
      const longAgo = new Date("1990-01-01T00:00:00Z");
      expect(
        await p.presenceEvents(setup.email, longAgo, new Date(longAgo.getTime() + 1000)),
      ).toEqual([]);
      expect(await p.presenceEvents(setup.email, setup.from, setup.from)).toEqual([]);
    });
  });
}
