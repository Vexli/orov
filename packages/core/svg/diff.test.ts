import { describe, expect, it } from "vitest";
import { diffFloor, hasChanges, type ExistingArea, type ExistingSpace } from "./diff";
import type { ParsedFloor, ParsedSpace } from "./parse";

const viewBox = { x: 0, y: 0, width: 100, height: 100 };

const parsed = (spaces: ParsedSpace[], areas = ["area-south"]): ParsedFloor => ({
  viewBox,
  errors: [],
  areas: areas.map((svgElementId) => ({ svgElementId, slug: svgElementId.slice(5), name: "x" })),
  spaces,
});

const desk = (n: string, area: string | null = null): ParsedSpace => ({
  svgElementId: `desk-2-${n}`,
  kind: "desk",
  name: `SF-2-${n}`,
  areaSvgElementId: area,
});

const areaRow: ExistingArea = { id: "area_south", svgElementId: "area-south", name: "South" };

const row = (n: string, extra: Partial<ExistingSpace> = {}): ExistingSpace => ({
  id: `sp_${n}`,
  svgElementId: `desk-2-${n}`,
  kind: "desk",
  name: `SF-2-${n}`,
  areaId: "area_south",
  archived: false,
  assignedTo: null,
  ...extra,
});

describe("diffFloor", () => {
  it("sorts every space into exactly one bucket", () => {
    const diff = diffFloor(
      parsed(
        [
          desk("001", "area-south"),
          desk("002", null),
          desk("004", "area-south"),
          desk("005", "area-new"),
        ],
        ["area-south", "area-new"],
      ),
      {
        areas: [areaRow],
        spaces: [
          row("001"),
          row("002"),
          row("003", { assignedTo: { personId: "p_bob", name: "Bob" } }),
          row("006"),
          row("004", { archived: true }),
          row("009", { archived: true }),
        ],
      },
    );

    expect(diff.areas.added.map((a) => a.svgElementId)).toEqual(["area-new"]);
    expect(diff.areas.unchanged).toEqual([areaRow]);
    expect(diff.areas.removed).toEqual([]);

    expect(diff.spaces.unchanged.map((s) => s.id)).toEqual(["sp_001"]);
    expect(diff.spaces.moved).toEqual([{ space: row("002"), from: "area-south", to: null }]);
    // 004 was archived and comes back; 005 is new.
    expect(diff.spaces.added.map((s) => [s.svgElementId, s.restoreId])).toEqual([
      ["desk-2-004", "sp_004"],
      ["desk-2-005", null],
    ]);
    expect(diff.spaces.removedAssigned.map((s) => s.id)).toEqual(["sp_003"]);
    expect(diff.spaces.removedUnassigned.map((s) => s.id)).toEqual(["sp_006"]);
    // An archived space that stays gone is not "removed" again.
    expect(JSON.stringify(diff)).not.toContain("sp_009");
    expect(hasChanges(diff)).toBe(true);
  });

  it("moves spaces out of an area the drawing no longer has", () => {
    const diff = diffFloor(parsed([desk("001", null)], []), {
      areas: [areaRow],
      spaces: [row("001")],
    });
    expect(diff.areas.removed).toEqual([areaRow]);
    expect(diff.spaces.moved).toEqual([{ space: row("001"), from: "area-south", to: null }]);
  });

  it("reports no changes for the same drawing", () => {
    const diff = diffFloor(parsed([desk("001", "area-south")]), {
      areas: [areaRow],
      spaces: [row("001")],
    });
    expect(hasChanges(diff)).toBe(false);
  });

  it("passes parse errors through", () => {
    const diff = diffFloor({ ...parsed([]), errors: ["bad id"] }, { areas: [], spaces: [] });
    expect(diff.errors).toEqual(["bad id"]);
  });
});
