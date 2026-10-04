import { describe, expect, it } from "vitest";
import { inheritedManager, inheritedTeams, reachesAncestor, reachesAncestorAny } from "./tree";

const parents = new Map<string, string | null>([
  ["a", "b"],
  ["b", "c"],
  ["c", null],
  ["x", "y"],
  ["y", "x"], // pre-existing cycle, must not hang the walk
]);
const parentOf = (id: string) => parents.get(id);

describe("reachesAncestor", () => {
  it("finds a target higher up the chain", () => {
    expect(reachesAncestor(parentOf, "a", "c")).toBe(true);
  });

  it("returns false when the target is not an ancestor", () => {
    expect(reachesAncestor(parentOf, "a", "z")).toBe(false);
  });

  it("terminates on a cycle that does not include the target", () => {
    expect(reachesAncestor(parentOf, "x", "z")).toBe(false);
  });

  it("returns false for a null start", () => {
    expect(reachesAncestor(parentOf, null, "a")).toBe(false);
  });
});

describe("inheritedManager", () => {
  // HR (lead Jane) > Payroll (lead Max) > Payroll Ops (no lead). Recruiting has no lead.
  const teams = new Map([
    ["hr", { parentTeamId: null, leadId: "jane" }],
    ["payroll", { parentTeamId: "hr", leadId: "max" }],
    ["payroll-ops", { parentTeamId: "payroll", leadId: null }],
    ["recruiting", { parentTeamId: null, leadId: null }],
  ]);

  it.each([
    ["a member gets their primary team's lead", "bob", "payroll", "max"],
    ["a lead gets the lead of the team above", "max", "payroll", "jane"],
    ["a team without a lead defers to its parent's", "bob", "payroll-ops", "max"],
    ["the top lead gets no one", "jane", "hr", null],
    ["no lead anywhere up the chain means no one", "bob", "recruiting", null],
    ["no primary team means no one", "bob", null, null],
    ["an unknown team means no one", "bob", "gone", null],
  ])("%s", (_, person, team, expected) => {
    expect(inheritedManager(person, team, teams)).toBe(expected);
  });

  it("stops on a cycle in the data", () => {
    const loop = new Map([
      ["a", { parentTeamId: "b", leadId: "x" }],
      ["b", { parentTeamId: "a", leadId: "x" }],
    ]);
    expect(inheritedManager("x", "a", loop)).toBeNull();
  });
});

describe("inheritedTeams", () => {
  const parents = new Map<string, string | null>([
    ["hr", null],
    ["payroll", "hr"],
    ["payroll-ops", "payroll"],
    ["recruiting", "hr"],
    ["eng", null],
  ]);
  const parentOf = (id: string) => parents.get(id);

  it.each([
    [["payroll-ops"], ["hr", "payroll"]],
    [["payroll", "recruiting"], ["hr"]],
    // HR is chosen as well, so it isn't inherited.
    [["payroll", "hr"], []],
    [["eng"], []],
    [[], []],
  ])("%j → %j", (teamIds, expected) => {
    expect(inheritedTeams(teamIds, parentOf)).toEqual(expected);
  });

  it("stops on a cycle in the data", () => {
    const loop = new Map([["a", "b"], ["b", "a"]]);
    expect(inheritedTeams(["a"], (id) => loop.get(id))).toEqual(["b"]);
  });
});

describe("reachesAncestorAny", () => {
  // Bob reports to Max and Ana; Ana reports to Jane; Max to nobody.
  const parents = new Map<string, string[]>([
    ["bob", ["max", "ana"]],
    ["ana", ["jane"]],
  ]);
  const parentsOf = (id: string) => parents.get(id) ?? [];

  it("follows every manager, not just the first", () => {
    expect(reachesAncestorAny(parentsOf, ["bob"], "jane")).toBe(true);
    expect(reachesAncestorAny(parentsOf, ["max"], "jane")).toBe(false);
  });

  it("stops on a cycle in the data", () => {
    const loop = new Map([["a", ["b"]], ["b", ["a"]]]);
    expect(reachesAncestorAny((id) => loop.get(id) ?? [], ["a"], "z")).toBe(false);
  });
});
