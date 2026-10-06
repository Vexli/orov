import { describe, expect, it } from "vitest";
import { FakeMessaging } from "./fakes/messaging";
import { NO_MESSAGING_CAPABILITIES, messagingCapabilities } from "./messaging";
import {
  IntegrationConfigError,
  PROVIDERS,
  describeIntegrations,
  loadIntegrations,
  parseIntegrationConfig,
  requireEnv,
  type ProviderFactories,
} from "./registry";

describe("parseIntegrationConfig", () => {
  it("defaults every kind to none", () => {
    expect(parseIntegrationConfig({})).toEqual({
      messaging: "none",
      calendar: "none",
      rooms: "none",
    });
  });

  it("reads each kind's variable, trimmed and lowercased; blank is none", () => {
    expect(
      parseIntegrationConfig({
        MESSAGING_PROVIDER: " Chat ",
        CALENDAR_PROVIDER: "",
        ROOMS_PROVIDER: "booker",
      }),
    ).toEqual({ messaging: "chat", calendar: "none", rooms: "booker" });
  });

  it("makes everything fake with INTEGRATIONS=fake, even over a real provider", () => {
    expect(parseIntegrationConfig({ INTEGRATIONS: "fake", MESSAGING_PROVIDER: "chat" })).toEqual({
      messaging: "fake",
      calendar: "fake",
      rooms: "fake",
    });
  });

  it("refuses any other INTEGRATIONS value", () => {
    expect(() => parseIntegrationConfig({ INTEGRATIONS: "real" })).toThrow(IntegrationConfigError);
  });
});

describe("loadIntegrations", () => {
  it("returns null for a kind that isn't configured", () => {
    expect(loadIntegrations({})).toEqual({ messaging: null, calendar: null, rooms: null });
  });

  it("builds the fakes", () => {
    const integrations = loadIntegrations({ INTEGRATIONS: "fake" });
    expect(integrations.messaging?.id).toBe("fake");
    expect(integrations.calendar?.id).toBe("fake");
    expect(integrations.rooms?.id).toBe("fake");
  });

  it("names the variable and the known providers for an unknown id", () => {
    expect(() => loadIntegrations({ MESSAGING_PROVIDER: "bogus" })).toThrow(
      'MESSAGING_PROVIDER="bogus" is not a known messaging provider (known: none, fake)',
    );
  });

  it("doesn't treat inherited object keys as providers", () => {
    expect(() => loadIntegrations({ ROOMS_PROVIDER: "constructor" })).toThrow(
      IntegrationConfigError,
    );
  });

  it("passes the environment to a provider's factory, which can require its settings", () => {
    const factories: ProviderFactories = {
      ...PROVIDERS,
      messaging: {
        chat: (env) => {
          requireEnv(env, "chat", "CHAT_TOKEN");
          return new FakeMessaging();
        },
      },
    };
    expect(() => loadIntegrations({ MESSAGING_PROVIDER: "chat" }, factories)).toThrow(
      "The chat provider needs CHAT_TOKEN",
    );
    expect(
      loadIntegrations({ MESSAGING_PROVIDER: "chat", CHAT_TOKEN: "t" }, factories).messaging,
    ).not.toBeNull();
  });
});

describe("capabilities and description", () => {
  it("has every capability off without a provider", () => {
    expect(messagingCapabilities(null)).toEqual(NO_MESSAGING_CAPABILITIES);
    expect(Object.values(NO_MESSAGING_CAPABILITIES).every((v) => v === false)).toBe(true);
  });

  it("describes each kind for the log", () => {
    const description = describeIntegrations({
      messaging: new FakeMessaging(),
      calendar: null,
      rooms: null,
    });
    expect(description.messaging).toMatchObject({
      provider: "fake",
      capabilities: { groupChat: true },
    });
    expect(description.calendar).toBe("none");
  });
});
