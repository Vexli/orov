import { describe, expect, it } from "vitest";
import { PROFILE_PROVIDER_IDS } from "../people/identities";
import { PEOPLE_CSV_HEADERS, parsePeopleCsv, peopleToCsv } from "./people";

const HEADER = "email,name,preferred_name,title,home_region,home_timezone,phone,start_date,active,manager_email,desk,teams,primary_team";

describe("parsePeopleCsv", () => {
  it("parses a full row into a person record", () => {
    const csv = `${HEADER}\nJane@Example.com,Jane Doe,Jane,Head of HR,ca,America/Toronto,,2024-02-01,yes,,SF-2-014,HR;People Ops,HR\n`;
    const result = parsePeopleCsv(csv);
    expect(result.fatal).toBeUndefined();
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.record).toEqual({
      email: "jane@example.com",
      name: "Jane Doe",
      preferredName: "Jane",
      title: "Head of HR",
      phone: null,
      homeRegion: "CA",
      homeTimezone: "America/Toronto",
      startDate: "2024-02-01",
      active: true,
      managerEmail: null,
      deskCode: "SF-2-014",
      teamSlugs: ["hr", "people ops"],
      primaryTeamSlug: "hr",
      identities: {},
    });
  });

  it("treats a blank active cell as true and 'no' as false", () => {
    const csv = `${HEADER}\na@x.com,A,,,US,,,,,,,,\nb@x.com,B,,,US,,,,no,,,,\n`;
    const { rows } = parsePeopleCsv(csv);
    expect(rows.map((r) => r.record.active)).toEqual([true, false]);
  });

  it("reports a fatal error when a required column is missing", () => {
    const result = parsePeopleCsv("email,name\na@x.com,A\n");
    expect(result.fatal).toMatch(/home_region/);
    expect(result.rows).toEqual([]);
  });

  it("reports per-row issues with the line number and keeps the valid rows", () => {
    const csv = `${HEADER}\nok@x.com,OK,,,US,,,,,,,,\nnot-an-email,Bad,,,US,,,,,,,,\n,NoEmail,,,US,,,,,,,,\n`;
    const result = parsePeopleCsv(csv);
    expect(result.rows.map((r) => r.record.email)).toEqual(["ok@x.com"]);
    expect(result.issues.map((i) => i.line)).toEqual([3, 4]);
    expect(result.issues[0]?.message).toMatch(/email/);
  });

  it("rejects a primary team that is not in the team list", () => {
    const csv = `${HEADER}\na@x.com,A,,,US,,,,,,,hr,ops\n`;
    const result = parsePeopleCsv(csv);
    expect(result.issues[0]?.message).toMatch(/primary_team "ops" must also appear in teams/);
  });

  it("accepts an ISO 3166-2 subdivision code in any case", () => {
    const csv = `${HEADER}\na@x.com,A,,,us-ca,,,,,,,,\n`;
    expect(parsePeopleCsv(csv).rows[0]?.record.homeRegion).toBe("US-CA");
  });

  it("rejects a malformed region code", () => {
    const csv = `${HEADER}\na@x.com,A,,,U1,,,,,,,,\n`;
    expect(parsePeopleCsv(csv).issues[0]?.message).toMatch(/home_region must be an ISO 3166 code/);
  });

  it("rejects a subdivision that ISO 3166-2 doesn't list", () => {
    const csv = `${HEADER}\na@x.com,A,,,US-XX,,,,,,,,\n`;
    expect(parsePeopleCsv(csv).issues[0]?.message).toMatch(/"US-XX" is not an ISO 3166/);
  });

  it("still reads the old home_country column, and ignores columns the app does not know about", () => {
    const csv = `Email,Name,Home_Country,Notes\na@x.com,A,US,hello\n`;
    const result = parsePeopleCsv(csv);
    expect(result.fatal).toBeUndefined();
    expect(result.issues).toEqual([]);
    expect(result.rows[0]?.record.homeRegion).toBe("US");
  });

  it("prefers home_region when a file has both columns", () => {
    const csv = `email,name,home_country,home_region\na@x.com,A,US,US-NY\n`;
    expect(parsePeopleCsv(csv).rows[0]?.record.homeRegion).toBe("US-NY");
  });
});

describe("phone", () => {
  it("is stored in E.164, read in the home region's country", () => {
    const csv = `${HEADER}\na@x.com,A,,,US-CA,,(415) 555-0123,,,,,,\nb@x.com,B,,,GB,,020 7946 0018,,,,,,\n`;
    const { rows } = parsePeopleCsv(csv);
    expect(rows.map((r) => r.record.phone)).toEqual(["+14155550123", "+442079460018"]);
  });

  it("is a row error when it isn't a number", () => {
    const { issues } = parsePeopleCsv(`${HEADER}\na@x.com,A,,,US,,call reception,,,,,,\n`);
    expect(issues[0]?.message).toMatch(/^phone: Phone isn't a valid number/);
  });
});

describe("home_timezone", () => {
  it("is stored canonically, and a made-up zone is a row error", () => {
    const csv = `${HEADER}\na@x.com,A,,,US,america/new_york,,,,,,,\nb@x.com,B,,,US,Mars/Olympus,,,,,,,\n`;
    const { rows, issues } = parsePeopleCsv(csv);
    expect(rows[0]?.record.homeTimezone).toBe("America/New_York");
    expect(issues).toEqual([{ line: 3, message: expect.stringMatching(/^home_timezone is not an IANA time zone/) }]);
  });
});

describe("identity columns", () => {
  it("has one column per profile provider, in registry order", () => {
    expect(PEOPLE_CSV_HEADERS.slice(-PROFILE_PROVIDER_IDS.length)).toEqual(PROFILE_PROVIDER_IDS);
  });

  it("normalizes handles and profile URLs", () => {
    const csv = `${HEADER},github,linkedin\nbob@x.com,Bob,,,US,,,,,,,,,https://github.com/BobL/,linkedin.com/in/bob-l\n`;
    const { rows, issues } = parsePeopleCsv(csv);
    expect(issues).toEqual([]);
    expect(rows[0]?.record.identities).toEqual({ github: "bobl", linkedin: "bob-l" });
  });

  it("rejects a value the provider doesn't accept", () => {
    const csv = `${HEADER},github\nbob@x.com,Bob,,,US,,,,,,,,,https://gitlab.com/bob\n`;
    const { rows, issues } = parsePeopleCsv(csv);
    expect(rows).toEqual([]);
    expect(issues[0]?.message).toMatch(/^github: GitHub is not valid/);
  });
});

describe("peopleToCsv", () => {
  it("round-trips through parsePeopleCsv", () => {
    const original = [
      {
        email: "bob@x.com",
        name: "Bob",
        preferredName: null,
        title: "Analyst, Data",
        phone: null,
        homeRegion: "US-CA",
        homeTimezone: null,
        startDate: null,
        active: false,
        managerEmail: "max@x.com",
        deskCode: "SF-2-001",
        teamSlugs: ["hr", "payroll"],
        primaryTeamSlug: "payroll",
        identities: { github: "bobl", website: "https://bob.example.com/" },
      },
    ];
    const csv = peopleToCsv(original);
    expect(csv.split("\n")[0]).toBe(`${HEADER},github,gitlab,linkedin,website`);
    const { rows, issues } = parsePeopleCsv(csv);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.record)).toEqual(original);
  });
});
