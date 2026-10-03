import { describe, expect, it } from "vitest";
import { reachesAncestor } from "./tree";

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
