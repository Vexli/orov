import { describe, expect, it } from "vitest";
import { deskCenters } from "./positions";

describe("deskCenters", () => {
  it("finds each desk's centre, through a group's transform", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
      <rect id="desk-2-001" x="0" y="0" width="100" height="50"/>
      <g transform="translate(200 100)"><rect id="desk-2-002" x="0" y="0" width="100" height="50"/></g>
      <rect id="room-a" x="0" y="0" width="10" height="10"/>
    </svg>`;
    expect(Object.fromEntries(deskCenters(svg))).toEqual({
      "desk-2-001": { x: 50, y: 25 },
      "desk-2-002": { x: 250, y: 125 },
    });
  });
});
