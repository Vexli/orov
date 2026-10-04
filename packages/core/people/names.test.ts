import { describe, expect, it } from "vitest";
import { compareByFamilyName, fullName, splitFullName } from "./names";

describe("splitFullName", () => {
  it.each([
    ["Bob Lindqvist", "Bob", "Lindqvist"],
    ["Mary Ann Smith", "Mary Ann", "Smith"],
    ["Ana María de la Cruz", "Ana María de la", "Cruz"],
    ["  José   Müller ", "José", "Müller"],
    ["Priya", "Priya", null],
  ])("%j → %j / %j", (name, givenName, familyName) => {
    expect(splitFullName(name)).toEqual({ givenName, familyName });
  });
});

describe("fullName", () => {
  it("joins the parts, and leaves a single name alone", () => {
    expect(fullName({ givenName: "Mary Ann", familyName: "Smith" })).toBe("Mary Ann Smith");
    expect(fullName({ givenName: "Priya", familyName: null })).toBe("Priya");
  });
});

describe("compareByFamilyName", () => {
  it("sorts by family name, then given name", () => {
    const people = [
      { givenName: "Zoë", familyName: "Ångström" },
      { givenName: "Bob", familyName: "Lindqvist" },
      { givenName: "Anna", familyName: "Lindqvist" },
      { givenName: "Kaito", familyName: null },
    ];
    expect([...people].sort(compareByFamilyName).map(fullName)).toEqual([
      "Zoë Ångström",
      "Kaito",
      "Anna Lindqvist",
      "Bob Lindqvist",
    ]);
  });
});
