import { describe, expect, it } from "vitest";
import { BASE_CSP, createNonce, pageCsp } from "./csp";

describe("pageCsp", () => {
  it("keeps the base directives and allows only nonced scripts", () => {
    const csp = pageCsp("abc123", { dev: false });
    expect(csp.startsWith(BASE_CSP)).toBe(true);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows eval in development only", () => {
    expect(pageCsp("n", { dev: true })).toContain("'unsafe-eval'");
  });
});

describe("createNonce", () => {
  it("is 128 random bits in base64, different each time", () => {
    const a = createNonce();
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(createNonce()).not.toBe(a);
  });
});
