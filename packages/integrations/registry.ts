// Chooses each integration's provider from the environment (docs/integrations/README.md), the
// way AUTH_PROVIDERS chooses sign-in providers in apps/web/lib/auth-providers.ts.
//
//   MESSAGING_PROVIDER, CALENDAR_PROVIDER, ROOMS_PROVIDER   a provider id, or none (the default)
//   INTEGRATIONS=fake                                       all three are the in-memory fakes
//
// A provider that isn't configured is null, never a stand-in that pretends to work, so nothing
// runs and the UI shows nothing for it.

import type { CalendarProvider } from "./calendar";
import { FakeCalendar } from "./fakes/calendar";
import { FakeMessaging } from "./fakes/messaging";
import { FakeRooms } from "./fakes/rooms";
import type { MessagingProvider } from "./messaging";
import type { RoomProvider } from "./rooms";

export type Env = Record<string, string | undefined>;

export type IntegrationKind = "messaging" | "calendar" | "rooms";

export const INTEGRATION_KINDS: readonly IntegrationKind[] = ["messaging", "calendar", "rooms"];

export const INTEGRATION_ENV: Record<IntegrationKind, string> = {
  messaging: "MESSAGING_PROVIDER",
  calendar: "CALENDAR_PROVIDER",
  rooms: "ROOMS_PROVIDER",
};

export const NONE = "none";

// The provider id chosen for each kind, or "none".
export type IntegrationConfig = Record<IntegrationKind, string>;

export class IntegrationConfigError extends Error {
  override name = "IntegrationConfigError";
}

// Reads the provider ids from the environment. Pure, so it is tested without any provider.
export function parseIntegrationConfig(env: Env): IntegrationConfig {
  const mode = env.INTEGRATIONS?.trim().toLowerCase() ?? "";
  if (mode !== "" && mode !== "fake") {
    throw new IntegrationConfigError(
      `INTEGRATIONS="${env.INTEGRATIONS}" is not supported; use fake or leave it unset`,
    );
  }
  const config = {} as IntegrationConfig;
  for (const kind of INTEGRATION_KINDS) {
    const id = env[INTEGRATION_ENV[kind]]?.trim().toLowerCase() || NONE;
    // INTEGRATIONS=fake wins, so an offline run can never reach a real tool by accident.
    config[kind] = mode === "fake" ? "fake" : id;
  }
  return config;
}

export interface ProviderFactories {
  messaging: Record<string, (env: Env) => MessagingProvider>;
  calendar: Record<string, (env: Env) => CalendarProvider>;
  rooms: Record<string, (env: Env) => RoomProvider>;
}

// Every provider OrOv ships. A real adapter adds itself here, with its code in
// providers/<id>/ (docs/integrations/README.md, "Adding a provider").
export const PROVIDERS: ProviderFactories = {
  messaging: { fake: () => new FakeMessaging() },
  calendar: { fake: () => new FakeCalendar() },
  rooms: { fake: () => new FakeRooms() },
};

export interface Integrations {
  messaging: MessagingProvider | null;
  calendar: CalendarProvider | null;
  rooms: RoomProvider | null;
}

// Builds the configured providers. Throws IntegrationConfigError for an unknown id or a provider
// whose own settings are missing, so a misconfigured deployment fails at startup.
export function loadIntegrations(env: Env, factories: ProviderFactories = PROVIDERS): Integrations {
  const config = parseIntegrationConfig(env);
  const build = <T>(
    kind: IntegrationKind,
    available: Record<string, (env: Env) => T>,
  ): T | null => {
    const id = config[kind];
    if (id === NONE) return null;
    const factory = Object.hasOwn(available, id) ? available[id] : undefined;
    if (!factory) {
      const known = [NONE, ...Object.keys(available)].join(", ");
      throw new IntegrationConfigError(
        `${INTEGRATION_ENV[kind]}="${id}" is not a known ${kind} provider (known: ${known})`,
      );
    }
    return factory(env);
  };
  return {
    messaging: build("messaging", factories.messaging),
    calendar: build("calendar", factories.calendar),
    rooms: build("rooms", factories.rooms),
  };
}

// For a provider's factory: the named settings must be set, or the deployment fails at startup.
export function requireEnv(env: Env, provider: string, ...names: string[]): void {
  const missing = names.filter((n) => !env[n]);
  if (missing.length > 0) {
    throw new IntegrationConfigError(`The ${provider} provider needs ${missing.join(", ")}`);
  }
}

// A log-friendly summary: each kind's provider id and capabilities, or "none".
export function describeIntegrations(integrations: Integrations) {
  const describe = (p: { id: string; capabilities: object } | null) =>
    p ? { provider: p.id, capabilities: p.capabilities } : NONE;
  return {
    messaging: describe(integrations.messaging),
    calendar: describe(integrations.calendar),
    rooms: describe(integrations.rooms),
  };
}
