import { z } from "zod";

// IANA time zones, for offices and people. A zone is stored as the admin named it, with its
// capitalization fixed ("america/new_york" → "America/New_York"), so the same zone isn't stored
// two ways by accident.
//
// Only the case is changed, never the name. Intl's resolvedOptions().timeZone also swaps an alias
// for ICU's preferred id, and ICU prefers the old names: Node turns "Asia/Kolkata" into
// "Asia/Calcutta" and "Europe/Kyiv" into "Europe/Kiev". Storing that would rewrite correct data.

// The stored form of a zone, or null if it isn't one. Intl also accepts UTC offsets ("+05:30"),
// which aren't IANA zones and have no daylight-saving rules, so those are refused.
export function canonicalTimeZone(value: string): string | null {
  const zone = value.trim();
  if (!/^[A-Za-z]/.test(zone)) return null;
  const resolved = resolve(zone);
  if (resolved === null) return null;
  // Intl's spelling, when it names the same zone (only the case differs).
  if (resolved.toLowerCase() === zone.toLowerCase()) return resolved;
  // An alias. Keep it, title-cased if that still names the same zone, else exactly as given.
  const titled = zone.replace(/(^|[/_-])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
  return zone === zone.toLowerCase() && resolve(titled) === resolved ? titled : zone;
}

function resolve(zone: string): string | null {
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

// A person's home time zone: the one they were given, else their desk's office's (#19), else none.
// Applied when a person is saved or imported, so a blank never overwrites an explicit value.
export function defaultTimeZone(explicit: string | null, deskTimeZone: string | null | undefined): string | null {
  return explicit ?? deskTimeZone ?? null;
}
