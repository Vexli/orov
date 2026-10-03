import { describe, expect, it } from "vitest";
import { containsPattern, MAX_QUERY_LENGTH, normalizeQuery } from "./model";

describe("normalizeQuery", () => {
  it("trims, collapses spaces and caps the length", () => {
    expect(normalizeQuery("  bob   lind ")).toBe("bob lind");
    expect(normalizeQuery(null)).toBe("");
    expect(normalizeQuery("x".repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe("containsPattern", () => {
  it("wraps the query in wildcards", () => {
    expect(containsPattern("bob")).toBe("%bob%");
  });

  it("takes the query's own wildcards and backslashes literally", () => {
    expect(containsPattern("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
  });
});
