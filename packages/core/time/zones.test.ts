import { describe, expect, it } from "vitest";
import { personFormSchema } from "../people/form";
import { locationFormSchema } from "../spaces/form";
import { canonicalTimeZone, timeZoneOptions } from "./zones";

describe("canonicalTimeZone", () => {
  it.each([
    ["america/new_york", "America/New_York"],
    ["  Europe/London ", "Europe/London"],
    ["utc", "UTC"],
    // Aliases are kept. Node's ICU would turn these into Asia/Calcutta, Europe/Kiev and UTC.
    ["Asia/Kolkata", "Asia/Kolkata"],
    ["asia/kolkata", "Asia/Kolkata"],
    ["Europe/Kyiv", "Europe/Kyiv"],
    ["Etc/UTC", "Etc/UTC"],
    ["US/Pacific", "US/Pacific"],
  ])("stores %j as %j", (input, zone) => {
    expect(canonicalTimeZone(input)).toBe(zone);
  });

  it.each(["Mars/Olympus", "+05:30", "-08:00", "", "America/"])("refuses %j", (input) => {
    expect(canonicalTimeZone(input)).toBeNull();
  });
});

describe("timeZoneOptions", () => {
  it("includes UTC, which Intl leaves out", () => {
    expect(timeZoneOptions()).toContain("UTC");
    expect(timeZoneOptions()).toContain("America/Los_Angeles");
  });
});

describe("forms", () => {
  const office = { slug: "ny", name: "New York", region: "US-NY", sortOrder: 0 };
  it("stores an office's zone canonically and refuses a made-up one", () => {
    expect(locationFormSchema.parse({ ...office, timezone: "america/new_york" }).timezone).toBe(
      "America/New_York",
    );
    const bad = locationFormSchema.safeParse({ ...office, timezone: "Mars/Olympus" });
    expect(bad.error?.issues[0]).toMatchObject({ path: ["timezone"] });
  });

  const person = {
    email: "a@x.com",
    givenName: "A",
    familyName: null,
    preferredName: null,
    title: null,
    phone: null,
    homeRegion: "US",
    startDate: null,
    endDate: null,
    active: true,
    managerId: null,
    assignedDeskId: null,
    officeId: null,
    teamIds: [],
    primaryTeamId: null,
    identities: {},
  };
  it("keeps a person's zone optional, and canonical when given", () => {
    expect(personFormSchema.parse({ ...person, homeTimezone: null }).homeTimezone).toBeNull();
    expect(personFormSchema.parse({ ...person, homeTimezone: " " }).homeTimezone).toBeNull();
    expect(personFormSchema.parse({ ...person, homeTimezone: "asia/tokyo" }).homeTimezone).toBe("Asia/Tokyo");
    const bad = personFormSchema.safeParse({ ...person, homeTimezone: "Mars/Olympus" });
    expect(bad.error?.issues[0]).toMatchObject({ path: ["homeTimezone"] });
  });
});
