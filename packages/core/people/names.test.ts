import { describe, expect, it } from "vitest";
import { compareByFamilyName, fullName, sortByName, splitFullName } from "./names";

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

describe("sortByName", () => {
  it("sorts by the shown name, ignoring case and accents like the lists", () => {
    const names = ["max Osei", "Ángela", "Bob Lindqvist", "anna"].map((name) => ({ name }));
    expect(sortByName(names).map((n) => n.name)).toEqual(["Ángela", "anna", "Bob Lindqvist", "max Osei"]);
  });
});
