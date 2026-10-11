import { describe, expect, it } from "vitest";
import { planSeating, type PlanDesk, type PlanPerson } from "./plan";

// Two rows of four desks on floor 0, 100 units apart, and two desks on floor 1.
const desks: PlanDesk[] = [
  ...[0, 1, 2, 3].map((i) => ({ id: `a${i}`, floorIndex: 0, areaId: "west", x: i * 100, y: 0 })),
  ...[0, 1, 2, 3].map((i) => ({ id: `b${i}`, floorIndex: 0, areaId: "east", x: 1000 + i * 100, y: 0 })),
  { id: "c0", floorIndex: 1, areaId: null, x: 0, y: 0 },
  { id: "c1", floorIndex: 1, areaId: null, x: 100, y: 0 },
];

const person = (id: string, teamId: string | null, currentDeskId: string | null = null, locked = false): PlanPerson => ({
  id,
  name: id,
  teamId,
  currentDeskId,
  locked,
});

const deskOf = (result: ReturnType<typeof planSeating>, id: string) => result.assignments.get(id);
const areaOf = (deskId: string | undefined) => desks.find((d) => d.id === deskId)?.areaId;

describe("planSeating", () => {
  it("seats each team together, the largest team first", () => {
    // Scattered today: HR across both areas, Eng likewise.
    const people = [
      person("hr1", "hr", "a0"),
      person("hr2", "hr", "b1"),
      person("hr3", "hr", "a2"),
      person("eng1", "eng", "b0"),
      person("eng2", "eng", "a1"),
    ];
    const result = planSeating(desks, people);
    const hrAreas = new Set(["hr1", "hr2", "hr3"].map((id) => areaOf(deskOf(result, id))));
    const engAreas = new Set(["eng1", "eng2"].map((id) => areaOf(deskOf(result, id))));
    expect(hrAreas.size).toBe(1);
    expect(engAreas.size).toBe(1);
    expect(result.unseated).toEqual([]);
  });

  it("keeps locked people where they are, and gathers their team around them", () => {
    const people = [person("lead", "hr", "b2", true), person("hr1", "hr", "a0"), person("hr2", "hr", "a1")];
    const result = planSeating(desks, people);
    expect(deskOf(result, "lead")).toBe("b2");
    expect(areaOf(deskOf(result, "hr1"))).toBe("east");
    expect(areaOf(deskOf(result, "hr2"))).toBe("east");
  });

  it("doesn't move someone who is already sitting with their team", () => {
    const people = [person("hr1", "hr", "a0"), person("hr2", "hr", "a1")];
    const result = planSeating(desks, people);
    expect(deskOf(result, "hr1")).toBe("a0");
    expect(deskOf(result, "hr2")).toBe("a1");
  });

  it("goes to another floor only when a floor is full, and reports who couldn't be seated", () => {
    const people = Array.from({ length: 11 }, (_, i) => person(`p${i}`, "big"));
    const result = planSeating(desks, people);
    expect(result.assignments.size).toBe(10);
    expect(result.unseated).toHaveLength(1);
    const floors = [...result.assignments.values()].map((id) => desks.find((d) => d.id === id)!.floorIndex);
    expect(floors.filter((f) => f === 0)).toHaveLength(8);
  });
});
