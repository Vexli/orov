import { describe, expect, it } from "vitest";
import { labelLayout } from "./labels";

const box = (width: number, height: number) => ({ x: 100, y: 200, width, height });

describe("labelLayout", () => {
  it("centres a room's name at up to 18 units", () => {
    expect(labelLayout(box(300, 200), "Boardroom")).toEqual({
      x: 250,
      y: 300,
      fontSize: 18,
      text: "Boardroom",
      truncated: false,
    });
  });

  it("shrinks a name to fit a narrow room", () => {
    const layout = labelLayout(box(70, 100), "Phone 1")!;
    expect(layout.fontSize).toBeLessThan(18);
    expect(layout.fontSize * 0.6 * "Phone 1".length).toBeLessThanOrEqual(63);
    expect(layout.truncated).toBe(false);
  });

  it("cuts a name short with an ellipsis rather than going below 9 units", () => {
    const layout = labelLayout(box(80, 100), "Interview Room North")!;
    expect(layout.fontSize).toBe(9);
    expect(layout.truncated).toBe(true);
    expect(layout.text.endsWith("…")).toBe(true);
    expect([...layout.text].length * 9 * 0.6).toBeLessThanOrEqual(80 * 0.9);
  });

  it("leaves out a label that can't fit", () => {
    expect(labelLayout(box(12, 100), "Elevator")).toBeNull();
    expect(labelLayout(box(200, 20), "Elevator")).toBeNull();
    expect(labelLayout(box(200, 100), "")).toBeNull();
  });
});
