import { describe, expect, it } from "vitest";
import { parsePeopleCsv, peopleToCsv } from "./people";

const HEADER = "email,name,preferred_name,title,home_country,home_timezone,phone,start_date,active,manager_email,desk,teams,primary_team";

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
      homeCountry: "CA",
      homeTimezone: "America/Toronto",
      startDate: "2024-02-01",
      active: true,
      managerEmail: null,
      deskCode: "SF-2-014",
      teamSlugs: ["hr", "people ops"],
      primaryTeamSlug: "hr",
    });
  });

  it("treats a blank active cell as true and 'no' as false", () => {
    const csv = `${HEADER}\na@x.com,A,,,US,,,,,,,,\nb@x.com,B,,,US,,,,no,,,,\n`;
    const { rows } = parsePeopleCsv(csv);
    expect(rows.map((r) => r.record.active)).toEqual([true, false]);
  });

  it("reports a fatal error when a required column is missing", () => {
    const result = parsePeopleCsv("email,name\na@x.com,A\n");
    expect(result.fatal).toMatch(/home_country/);
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

  it("rejects a two-letter country that is not alphabetic", () => {
    const csv = `${HEADER}\na@x.com,A,,,U1,,,,,,,,\n`;
    expect(parsePeopleCsv(csv).issues[0]?.message).toMatch(/home_country/);
  });

  it("ignores columns the app does not know about", () => {
    const csv = `Email,Name,Home_Country,Notes\na@x.com,A,US,hello\n`;
    const result = parsePeopleCsv(csv);
    expect(result.issues).toEqual([]);
    expect(result.rows[0]?.record.homeCountry).toBe("US");
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
        homeCountry: "US",
        homeTimezone: null,
        startDate: null,
        active: false,
        managerEmail: "max@x.com",
        deskCode: "SF-2-001",
        teamSlugs: ["hr", "payroll"],
        primaryTeamSlug: "payroll",
      },
    ];
    const csv = peopleToCsv(original);
    expect(csv.split("\n")[0]).toBe(HEADER);
    const { rows, issues } = parsePeopleCsv(csv);
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.record)).toEqual(original);
  });
});
