// The behaviour every MessagingProvider must have. A provider's test file calls
// messagingContract with a factory; the fake runs it in fakes.test.ts, and a real adapter runs it
// against recorded fixtures (docs/integrations/README.md, "Adding a provider").

import { describe, expect, it } from "vitest";
import type { MessagingProvider } from "../messaging";

export interface MessagingContractSetup {
  make: () => MessagingProvider | Promise<MessagingProvider>;
  // An email the provider knows and one it doesn't.
  knownEmail: string;
  unknownEmail: string;
  // A channel with at least one message posted after `since`, if the provider reads channels.
  statusChannel?: { channelId: string; since: Date };
}

const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

export function messagingContract(name: string, setup: MessagingContractSetup) {
  describe(`${name}: MessagingProvider contract`, () => {
    it("has a lowercase id that isn't the reserved 'none'", async () => {
      const p = await setup.make();
      expect(p.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(p.id).not.toBe("none");
      expect(p.label.trim()).not.toBe("");
    });

    it("declares exactly the optional methods it has", async () => {
      const p = await setup.make();
      expect(p.capabilities.groupChat).toBe(typeof p.openGroupChat === "function");
      expect(p.capabilities.profiles).toBe(typeof p.listProfiles === "function");
      expect(p.capabilities.statusHistory).toBe(typeof p.statusHistory === "function");
      expect(p.capabilities.liveEvents).toBe(typeof p.listen === "function");
      expect(p.capabilities.reactions).toBe(typeof p.react === "function");
      if (p.capabilities.groupChat) expect(p.maxGroupSize).toBeGreaterThanOrEqual(2);
      else expect(p.maxGroupSize).toBe(0);
    });

    it("matches a known email in any case to an id it accepts unchanged, and skips unknown ones", async () => {
      const p = await setup.make();
      const matches = await p.matchUsers([setup.knownEmail.toUpperCase(), setup.unknownEmail]);
      expect([...matches.keys()]).toEqual([setup.knownEmail.toLowerCase()]);
      const id = matches.get(setup.knownEmail.toLowerCase())!;
      expect(p.normalizeUserId(id)).toBe(id);
      expect(await p.matchUsers([])).toEqual(new Map());
    });

    it("refuses a blank user id", async () => {
      const p = await setup.make();
      expect(p.normalizeUserId("")).toBeNull();
      expect(p.normalizeUserId("   ")).toBeNull();
    });

    it("builds links with an https web fallback", async () => {
      const p = await setup.make();
      const id = (await p.matchUsers([setup.knownEmail])).get(setup.knownEmail.toLowerCase())!;
      for (const link of [p.personLink(id), p.channelLink("channel")]) {
        if (link === null) continue;
        expect(isHttpsUrl(link.web)).toBe(true);
        if (link.app !== undefined) expect(() => new URL(link.app!)).not.toThrow();
      }
    });

    it("refuses a group chat larger than maxGroupSize", async () => {
      const p = await setup.make();
      if (!p.openGroupChat) return;
      const ids = Array.from({ length: p.maxGroupSize + 1 }, (_, i) => `id-${i}`);
      await expect(p.openGroupChat("token", ids)).rejects.toThrow();
    });

    it("returns profiles with an email and an id it accepts", async () => {
      const p = await setup.make();
      if (!p.listProfiles) return;
      const profiles = await p.listProfiles();
      expect(profiles.length).toBeGreaterThan(0);
      for (const user of profiles) {
        expect(user.email).toContain("@");
        expect(p.normalizeUserId(user.externalId)).toBe(user.externalId);
        if (user.photoUrl !== undefined) expect(isHttpsUrl(user.photoUrl)).toBe(true);
      }
    });

    it("returns channel history oldest first, within the window", async () => {
      const p = await setup.make();
      if (!p.statusHistory || !setup.statusChannel) return;
      const { channelId, since } = setup.statusChannel;
      const messages = await p.statusHistory(channelId, since);
      expect(messages.length).toBeGreaterThan(0);
      const times = messages.map((m) => m.postedAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
      for (const m of messages) {
        expect(m.channelId).toBe(channelId);
        expect((m.editedAt ?? m.postedAt).getTime()).toBeGreaterThanOrEqual(since.getTime());
      }
      expect(new Set(messages.map((m) => m.ref)).size).toBe(messages.length);
    });
  });
}
