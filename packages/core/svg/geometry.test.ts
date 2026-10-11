import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { elementBounds, parseTransform, pathPoints, type Box } from "./geometry";

function boundsOf(svgBody: string, id: string): Box | null {
  const root = JSDOM.fragment(`<svg viewBox="0 0 1000 1000">${svgBody}</svg>`).firstElementChild!;
  return elementBounds(root.querySelector(`#${id}`)!, root);
}

const close = (b: Box | null, expected: Box) => {
  expect(b).not.toBeNull();
  for (const k of ["x", "y", "width", "height"] as const) expect(b![k]).toBeCloseTo(expected[k], 5);
};

describe("elementBounds", () => {
  it.each<[string, string, Box]>([
    [
      "rect",
      '<rect id="t" x="10" y="20" width="30" height="40"/>',
      { x: 10, y: 20, width: 30, height: 40 },
    ],
    ["circle", '<circle id="t" cx="50" cy="50" r="10"/>', { x: 40, y: 40, width: 20, height: 20 }],
    [
      "ellipse",
      '<ellipse id="t" cx="50" cy="50" rx="20" ry="5"/>',
      { x: 30, y: 45, width: 40, height: 10 },
    ],
    [
      "line",
      '<line id="t" x1="5" y1="50" x2="15" y2="10"/>',
      { x: 5, y: 10, width: 10, height: 40 },
    ],
    ["polygon", '<polygon id="t" points="0,0 10,5 4,20"/>', { x: 0, y: 0, width: 10, height: 20 }],
    [
      "absolute path",
      '<path id="t" d="M10 10 H 50 V 30 Z"/>',
      { x: 10, y: 10, width: 40, height: 20 },
    ],
    [
      "relative path",
      '<path id="t" d="m10 10 h40 v20 h-40z"/>',
      { x: 10, y: 10, width: 40, height: 20 },
    ],
    [
      "group of shapes",
      '<g id="t"><rect x="0" y="0" width="10" height="10"/><rect x="50" y="60" width="10" height="10"/></g>',
      { x: 0, y: 0, width: 60, height: 70 },
    ],
    [
      "translated rect",
      '<rect id="t" transform="translate(100 50)" x="0" y="0" width="10" height="10"/>',
      { x: 100, y: 50, width: 10, height: 10 },
    ],
    [
      "rect in a scaled group",
      '<g transform="scale(2)"><rect id="t" x="5" y="5" width="10" height="10"/></g>',
      { x: 10, y: 10, width: 20, height: 20 },
    ],
    [
      "rect in nested transforms",
      '<g transform="translate(100,0)"><g transform="scale(2 3)"><rect id="t" x="1" y="1" width="1" height="1"/></g></g>',
      { x: 102, y: 3, width: 2, height: 3 },
    ],
    [
      "rotated rect",
      '<rect id="t" transform="rotate(90 5 5)" x="0" y="0" width="10" height="2"/>',
      { x: 8, y: 0, width: 2, height: 10 },
    ],
  ])("%s", (_, body, expected) => {
    close(boundsOf(body, "t"), expected);
  });

  it("ignores text inside a group", () => {
    close(
      boundsOf('<g id="t"><rect width="10" height="10"/><text x="900" y="900">far</text></g>', "t"),
      {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      },
    );
  });

  it("returns null for an empty group", () => {
    expect(boundsOf('<g id="t"></g>', "t")).toBeNull();
  });
});

describe("pathPoints", () => {
  it("reads compact arc flags", () => {
    expect(pathPoints("M0 0a5 5 0 0010 0")).toEqual([
      [0, 0],
      [10, 0],
    ]);
  });

  it("treats pairs after a moveto as linetos", () => {
    expect(pathPoints("M0 0 10 0 10 10")).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it("includes curve control points", () => {
    expect(pathPoints("M0 0 C 0 -10 10 -10 10 0")).toEqual([
      [0, 0],
      [0, -10],
      [10, -10],
      [10, 0],
    ]);
  });

  it("drops a truncated segment instead of failing", () => {
    expect(pathPoints("M0 0 L 10")).toEqual([[0, 0]]);
  });
});

describe("parseTransform", () => {
  it("composes left to right", () => {
    expect(parseTransform("translate(10 0) scale(2)")).toEqual([2, 0, 0, 2, 10, 0]);
  });

  it("ignores unknown functions", () => {
    expect(parseTransform("perspective(3) translate(1,2)")).toEqual([1, 0, 0, 1, 1, 2]);
  });
});
