import { iso31661, iso31662 } from "iso-3166";
import { z } from "zod";

// Where someone (or an office) is, as one ISO 3166 code: a country ("US", ISO 3166-1 alpha-2)
// or a subdivision of one ("US-CA", ISO 3166-2). A subdivision code starts with its country,
// so the country is never stored separately and the two can't disagree.
//
// This module holds the full subdivision list (about 5,000 rows). Import it from server code
// only; client components receive labels that were already formatted on the server.

export const REGION_CODE_PATTERN = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

// How a viewer prefers to see a region code. Stored per user in app_user.region_display.
// "flag" shows only the country's flag (N7); the country name stays in the page for screen
// readers and as a tooltip.
export const REGION_DISPLAYS = ["code", "country", "region", "country_region", "flag"] as const;
export type RegionDisplay = (typeof REGION_DISPLAYS)[number];
export const DEFAULT_REGION_DISPLAY: RegionDisplay = "country_region";

export function isRegionDisplay(value: unknown): value is RegionDisplay {
  return (REGION_DISPLAYS as readonly unknown[]).includes(value);
}

export const REGION_DISPLAY_LABELS: Record<RegionDisplay, string> = {
  code: "ISO 3166 code",
  country: "Country name",
  region: "Region name",
  country_region: "Region and country name",
  flag: "Flag only",
};

const countries = new Map(
  iso31661.filter((c) => c.state === "assigned").map((c) => [c.alpha2, c.name]),
);
const subdivisions = new Map(iso31662.map((s) => [s.code, s.name]));

// Uppercases and trims, so " us-ca" from a spreadsheet becomes "US-CA".
export function normalizeRegionCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function countryOf(code: string): string {
  return code.slice(0, 2);
}

// True for an assigned country code, or a subdivision code that ISO 3166-2 lists.
export function isKnownRegion(code: string): boolean {
  if (!REGION_CODE_PATTERN.test(code)) return false;
  return code.length === 2 ? countries.has(code) : subdivisions.has(code);
}

// The zod schema every boundary (CSV, admin form) uses, with the field name in its messages.
export function regionCodeSchema(field: string) {
  return z
    .string()
    .transform(normalizeRegionCode)
    .pipe(
      z
        .string()
        .regex(REGION_CODE_PATTERN, `${field} must be an ISO 3166 code, such as US or US-CA`)
        .refine(isKnownRegion, {
          error: (issue) =>
            `${field} "${String(issue.input)}" is not an ISO 3166 country or subdivision code`,
        }),
    );
}

const displayNames = new Map<string, Intl.DisplayNames>();

// Country names come from the runtime's ICU data, which uses everyday names ("United States")
// and follows the locale. ISO's own short names are the fallback.
export function countryName(code: string, locale = "en"): string {
  const country = countryOf(code);
  let names = displayNames.get(locale);
  if (!names) {
    names = new Intl.DisplayNames([locale], { type: "region", fallback: "none" });
    displayNames.set(locale, names);
  }
  return names.of(country) ?? countries.get(country) ?? country;
}

// The subdivision's own name, or null for a country-only code. ICU has no subdivision names,
// so these come from the ISO 3166-2 list as published (local spellings, not translated).
export function subdivisionName(code: string): string | null {
  return code.length > 2 ? (subdivisions.get(code) ?? null) : null;
}

// "US-CA" as each preference shows it: "US-CA", "United States", "California",
// "California, United States". A country-only code shows the country name for the last two.
// An unknown code (data from before validation got stricter) shows as the raw code.
export function formatRegion(code: string, display: RegionDisplay, locale = "en"): string {
  if (display === "code" || !isKnownRegion(code)) return code;
  const country = countryName(code, locale);
  const region = subdivisionName(code);
  switch (display) {
    // In flag-only mode the text is what screen readers get, and the fallback for no flag.
    case "country":
    case "flag":
      return country;
    case "region":
      return region ?? country;
    case "country_region":
      return region ? `${region}, ${country}` : country;
  }
}

// How a user wants region codes shown: the display mode, and whether to put the country's flag
// in front (#28). The flag is separate from the label so the UI can hide it from screen readers,
// and because Windows shows flag emoji as letter pairs ("CA"), the text label is always kept.
export interface RegionFormat {
  display: RegionDisplay;
  flag: boolean;
}

export const DEFAULT_REGION_FORMAT: RegionFormat = { display: DEFAULT_REGION_DISPLAY, flag: false };

// The flag of the code's country, as a pair of regional indicator symbols ("CA-ON" → 🇨🇦), or
// null for a country ISO 3166 doesn't list.
export function flagEmoji(code: string): string | null {
  const country = code.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(country) || !countries.has(country)) return null;
  return String.fromCodePoint(...[...country].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export interface RegionLabel {
  label: string;
  // Null unless the user asked for flags.
  flag: string | null;
  // Show the flag alone, with the label only for screen readers and as a tooltip (N7).
  flagOnly: boolean;
}

export function regionLabel(code: string, format: RegionFormat, locale = "en"): RegionLabel {
  if (format.display === "flag") {
    const flag = flagEmoji(code);
    // No flag (an unassigned code): the code itself.
    return flag ? { label: formatRegion(code, "flag", locale), flag, flagOnly: true } : { label: code, flag: null, flagOnly: false };
  }
  return { label: formatRegion(code, format.display, locale), flag: format.flag ? flagEmoji(code) : null, flagOnly: false };
}
