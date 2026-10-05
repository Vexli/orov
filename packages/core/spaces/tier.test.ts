import { describe, expect, it } from "vitest";
import { locationFormSchema } from "./form";
import { tierLabel } from "./tier";

describe("tierLabel", () => {
  const building = { singular: "Building", plural: "Buildings" };
  it.each([
    ["singular", "Building"],
    ["plural", "Buildings"],
    ["lower", "building"],
    ["lowerPlural", "buildings"],
    ["whole", "Whole building"],
  ] as const)("%s → %s", (form, expected) => {
    expect(tierLabel(building, form)).toBe(expected);
  });
});

describe("the office form's tier labels", () => {
  const office = { slug: "ldn", name: "London", timezone: "Europe/London", region: "GB", sortOrder: 0 };

  it("defaults to Floor and Floors", () => {
    expect(locationFormSchema.parse(office)).toMatchObject({
      floorLabelSingular: "Floor",
      floorLabelPlural: "Floors",
    });
  });

  it("takes custom labels, trimmed, and refuses blank ones", () => {
    const parsed = locationFormSchema.parse({ ...office, floorLabelSingular: " Campus ", floorLabelPlural: "Campuses" });
    expect(parsed).toMatchObject({ floorLabelSingular: "Campus", floorLabelPlural: "Campuses" });
    const blank = locationFormSchema.safeParse({ ...office, floorLabelSingular: " ", floorLabelPlural: "X" });
    expect(blank.error?.issues[0]?.path).toEqual(["floorLabelSingular"]);
  });
});
