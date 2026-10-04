// How a user sees dates and times (#27, their own setting, like region display). Built from
// Intl.DateTimeFormat parts, so the layout is exactly one of these whatever the server's locale:
//   iso  2026-10-04 14:30
//   dmy  04/10/2026 14:30
//   mdy  10/04/2026 2:30 PM
// CSV files always use ISO 8601, whatever the setting.

export const DATE_FORMATS = ["iso", "dmy", "mdy"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export const DEFAULT_DATE_FORMAT: DateFormat = "iso";

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  iso: "Year-month-day (ISO 8601)",
  dmy: "Day/month/year",
  mdy: "Month/day/year",
};

export function isDateFormat(value: unknown): value is DateFormat {
  return (DATE_FORMATS as readonly unknown[]).includes(value);
}

type Parts = Record<"year" | "month" | "day" | "hour" | "minute" | "dayPeriod" | "timeZoneName", string>;

function parts(date: Date, timeZone: string, hour12: boolean, zone: boolean): Parts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: hour12 ? "numeric" : "2-digit",
    minute: "2-digit",
    hourCycle: hour12 ? "h12" : "h23",
    ...(zone ? { timeZoneName: "short" } : {}),
  });
  const out = {} as Parts;
  for (const part of formatter.formatToParts(date)) out[part.type as keyof Parts] = part.value;
  return out;
}

// The calendar date in `timeZone`.
export function formatDate(date: Date, format: DateFormat, timeZone = "UTC"): string {
  const p = parts(date, timeZone, false, false);
  if (format === "dmy") return `${p.day}/${p.month}/${p.year}`;
  if (format === "mdy") return `${p.month}/${p.day}/${p.year}`;
  return `${p.year}-${p.month}-${p.day}`;
}

// Date and time to the minute in `timeZone`, with the zone's abbreviation when `zone` is set
// ("2026-10-04 14:30 PDT"), so a time shown in one zone can't be read as another.
export function formatDateTime(
  date: Date,
  format: DateFormat,
  timeZone = "UTC",
  { zone = false }: { zone?: boolean } = {},
): string {
  const p = parts(date, timeZone, format === "mdy", zone);
  const time = format === "mdy" ? `${p.hour}:${p.minute} ${p.dayPeriod}` : `${p.hour}:${p.minute}`;
  const suffix = zone && p.timeZoneName ? ` ${p.timeZoneName}` : "";
  return `${formatDate(date, format, timeZone)} ${time}${suffix}`;
}

// Minutes east of UTC that `timeZone` is at `instant` (Los Angeles in summer: -420).
function offsetMinutes(instant: number, timeZone: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((local - Math.floor(instant / 1000) * 1000) / 60_000);
}

// The instant a calendar day ("2026-10-04") starts in `timeZone`. `addDays` moves to a later day,
// so `[startOfDay(d), startOfDay(d, 1))` is the whole of day d there, DST changes included.
export function startOfDay(date: string, timeZone = "UTC", addDays = 0): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const midnightUtc = Date.UTC(y, m - 1, d + addDays);
  // The offset at a guess, then again at the corrected instant, in case a DST change lies between.
  let instant = midnightUtc - offsetMinutes(midnightUtc, timeZone) * 60_000;
  instant = midnightUtc - offsetMinutes(instant, timeZone) * 60_000;
  return new Date(instant);
}
