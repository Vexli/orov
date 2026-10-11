import { describe, expect, it } from "vitest";
import { calendarContract } from "./contract/calendar";
import { messagingContract } from "./contract/messaging";
import { roomContract } from "./contract/rooms";
import { DEMO_STATUS_CHANNEL } from "./fakes/demo";
import { FakeCalendar } from "./fakes/calendar";
import { FakeMessaging } from "./fakes/messaging";
import { FakeRooms } from "./fakes/rooms";
import type { StatusMessageEvent } from "./types";

const NOW = new Date("2026-10-06T15:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

messagingContract("FakeMessaging", {
  make: async () => {
    const fake = new FakeMessaging();
    await fake.post(DEMO_STATUS_CHANNEL, "FAKE-BOB", "wfh today", NOW);
    return fake;
  },
  knownEmail: "bob@example.com",
  unknownEmail: "sam@example.com",
  statusChannel: { channelId: DEMO_STATUS_CHANNEL, since: new Date(NOW.getTime() - HOUR_MS) },
});

calendarContract("FakeCalendar", {
  make: () => new FakeCalendar({ now: () => NOW }),
  email: "priya@example.com",
  from: NOW,
  to: new Date(NOW.getTime() + 7 * 24 * HOUR_MS),
});

roomContract("FakeRooms", {
  make: () => new FakeRooms({ now: () => NOW }),
  bookedResourceId: "boardroom@rooms.invalid",
  from: NOW,
  to: new Date(NOW.getTime() + 8 * HOUR_MS),
});

describe("FakeMessaging", () => {
  it("tells listeners about posts, edits and deletions until stopped", async () => {
    const fake = new FakeMessaging();
    const events: StatusMessageEvent["type"][] = [];
    const stop = await fake.listen(DEMO_STATUS_CHANNEL, async (e) => {
      events.push(e.type);
    });
    const message = await fake.post(DEMO_STATUS_CHANNEL, "FAKE-BOB", "wfh today", NOW);
    await fake.edit(DEMO_STATUS_CHANNEL, message.ref, "sick today", NOW);
    await fake.remove(DEMO_STATUS_CHANNEL, message.ref);
    await stop();
    await fake.post(DEMO_STATUS_CHANNEL, "FAKE-BOB", "in today", NOW);
    expect(events).toEqual(["posted", "edited", "deleted"]);
  });

  it("records reactions for the feedback loop", async () => {
    const fake = new FakeMessaging();
    await fake.react({ channelId: DEMO_STATUS_CHANNEL, ref: "m1" }, "🏠");
    expect(fake.reactions).toEqual([{ channelId: DEMO_STATUS_CHANNEL, ref: "m1", reaction: "🏠" }]);
  });

  it("needs the viewer's token to open a group chat", async () => {
    await expect(new FakeMessaging().openGroupChat("", ["FAKE-BOB", "FAKE-MAX"])).rejects.toThrow(
      /token/,
    );
  });
});

describe("FakeRooms", () => {
  it("has one room in each state the map shows", async () => {
    const rooms = new FakeRooms({ now: () => NOW });
    const ids = (await rooms.listRooms()).map((r) => r.resourceId);
    const busy = await rooms.freeBusy(ids, NOW, new Date(NOW.getTime() + 8 * HOUR_MS));
    const startsIn = (id: string) =>
      (busy.get(id)?.[0]?.start.getTime() ?? Infinity) - NOW.getTime();
    expect(startsIn("boardroom@rooms.invalid")).toBe(0); // clipped to the window: busy now
    expect(startsIn("huddle-a@rooms.invalid")).toBe(10 * 60 * 1000); // soon
    expect(busy.get("phone-1@rooms.invalid")).toEqual([]); // free
  });

  it("refuses more rooms than one call takes", async () => {
    const rooms = new FakeRooms({ now: () => NOW });
    const ids = Array.from({ length: rooms.maxResourcesPerCall + 1 }, (_, i) => `r${i}`);
    await expect(rooms.freeBusy(ids, NOW, NOW)).rejects.toThrow();
  });
});

describe("FakeCalendar", () => {
  it("has Bob working from home today", async () => {
    const events = await new FakeCalendar({ now: () => NOW }).presenceEvents(
      "bob@example.com",
      NOW,
      NOW,
    );
    expect(events).toEqual([]); // an empty window
    const today = await new FakeCalendar({ now: () => NOW }).presenceEvents(
      "bob@example.com",
      NOW,
      new Date(NOW.getTime() + HOUR_MS),
    );
    expect(today).toMatchObject([{ kind: "working_location", location: "home" }]);
  });
});
