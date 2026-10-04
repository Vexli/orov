import { z } from "zod";

// IANA time zones, for offices and people. Values are stored in the form Intl reports
// ("America/New_York" for "america/new_york"), so the same zone is never stored two ways.

// The stored form of a zone, or null if it isn't one. Intl also accepts UTC offsets ("+05:30"),
// which aren't IANA zones and have no daylight-saving rules, so those are refused.
export function canonicalTimeZone(value: string): string | null {
  const zone = value.trim();
  if (!/^[A-Za-z]/.test(zone)) return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function isTimeZone(value: string): boolean {
  return canonicalTimeZone(value) !== null;
}

// Every zone this runtime knows, for an input's suggestions. Intl leaves out UTC, so it's added.
export function timeZoneOptions(): string[] {
  return ["UTC", ...Intl.supportedValuesOf("timeZone")];
}

export const TIME_ZONE_HINT = "Use an IANA time zone, such as America/Los_Angeles";

// A required zone, stored canonically.
export function timeZoneSchema(message = TIME_ZONE_HINT) {
  return z.string().transform((value, ctx) => {
    const zone = canonicalTimeZone(value);
    if (zone === null) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return zone;
  });
}

// An optional zone: blank (or null) is none, anything else must be a real zone.
export function optionalTimeZoneSchema(message = TIME_ZONE_HINT) {
  return z
    .string()
    .nullable()
    .transform((value, ctx) => {
      if (value === null || value.trim() === "") return null;
      const zone = canonicalTimeZone(value);
      if (zone === null) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return zone;
    });
}
