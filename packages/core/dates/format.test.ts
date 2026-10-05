import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, isDateFormat, startOfDay } from "./format";

// 14:30 UTC on 4 October 2026, a Sunday; 07:30 in Los Angeles (PDT), 20:00 in Kolkata.
const at = new Date("2026-10-04T14:30:00Z");

describe("formatDate", () => {
  it.each([
    ["iso", "2026-10-04"],
    ["dmy", "04/10/2026"],
    ["mdy", "10/04/2026"],
  ] as const)("%s → %s", (format, expected) => {
    expect(formatDate(at, format)).toBe(expected);
  });

  it("uses the calendar date in the given zone", () => {
    expect(formatDate(new Date("2026-10-04T23:30:00Z"), "iso", "Asia/Tokyo")).toBe("2026-10-05");
  });
});

describe("formatDateTime", () => {
  it.each([
    ["iso", "UTC", "2026-10-04 14:30"],
    ["dmy", "UTC", "04/10/2026 14:30"],
    ["mdy", "UTC", "10/04/2026 2:30 PM"],
    ["iso", "America/Los_Angeles", "2026-10-04 07:30"],
    ["mdy", "America/Los_Angeles", "10/04/2026 7:30 AM"],
    ["dmy", "Asia/Kolkata", "04/10/2026 20:00"],
  ] as const)("%s in %s → %s", (format, zone, expected) => {
    expect(formatDateTime(at, format, zone)).toBe(expected);
  });

  it("adds the zone's abbreviation when asked", () => {
    expect(formatDateTime(at, "iso", "America/Los_Angeles", { zone: true })).toBe("2026-10-04 07:30 PDT");
    expect(formatDateTime(at, "iso", "UTC", { zone: true })).toBe("2026-10-04 14:30 UTC");
  });

  it("writes midnight as 00 in 24-hour formats and 12 AM in mdy", () => {
    const midnight = new Date("2026-10-04T00:05:00Z");
    expect(formatDateTime(midnight, "iso")).toBe("2026-10-04 00:05");
    expect(formatDateTime(midnight, "mdy")).toBe("10/04/2026 12:05 AM");
  });
});

describe("isDateFormat", () => {
  it("accepts only the known formats", () => {
    expect(isDateFormat("dmy")).toBe(true);
    expect(isDateFormat("ymd")).toBe(false);
  });
});

describe("startOfDay", () => {
  it.each([
    ["2026-10-04", "UTC", 0, "2026-10-04T00:00:00.000Z"],
    ["2026-10-04", "America/Los_Angeles", 0, "2026-10-04T07:00:00.000Z"],
    ["2026-10-04", "America/Los_Angeles", 1, "2026-10-05T07:00:00.000Z"],
    ["2026-10-04", "Asia/Kolkata", 0, "2026-10-03T18:30:00.000Z"],
    // Across the end of US daylight saving time on 2026-11-01: that day has 25 hours.
    ["2026-11-01", "America/Los_Angeles", 0, "2026-11-01T07:00:00.000Z"],
    ["2026-11-01", "America/Los_Angeles", 1, "2026-11-02T08:00:00.000Z"],
    // Month and year ends.
    ["2026-12-31", "Asia/Tokyo", 1, "2026-12-31T15:00:00.000Z"],
  ])("%s in %s, +%i days → %s", (date, zone, add, expected) => {
    expect(startOfDay(date, zone, add).toISOString()).toBe(expected);
  });
});
