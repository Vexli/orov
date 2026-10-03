import { describe, expect, it } from "vitest";
import { canSignIn, isBootstrapAdmin } from "./policy";

const DOMAIN = "example.com";

describe("canSignIn", () => {
  it("accepts a verified company account", () => {
    expect(canSignIn({ email: "jane@example.com", email_verified: true, hd: "example.com" }, DOMAIN)).toEqual({ ok: true });
  });

  it("rejects an unverified email even on the right domain", () => {
    const d = canSignIn({ email: "jane@example.com", email_verified: false, hd: "example.com" }, DOMAIN);
    expect(d).toEqual({ ok: false, reason: "email is not verified" });
  });

  it("rejects a consumer account with no hd claim", () => {
    const d = canSignIn({ email: "jane@gmail.com", email_verified: true }, DOMAIN);
    expect(d.ok).toBe(false);
  });

  it("rejects a Workspace account from another domain", () => {
    const d = canSignIn({ email: "jane@other.com", email_verified: true, hd: "other.com" }, DOMAIN);
    expect(d.ok).toBe(false);
  });

  it("rejects when hd matches but the email address does not", () => {
    const d = canSignIn({ email: "jane@evil.com", email_verified: true, hd: "example.com" }, DOMAIN);
    expect(d).toEqual({ ok: false, reason: "email domain does not match" });
  });
});

describe("isBootstrapAdmin", () => {
  it("matches case-insensitively and ignores whitespace in the env list", () => {
    expect(isBootstrapAdmin("Jane@Example.com", [" jane@example.com "])).toBe(true);
    expect(isBootstrapAdmin("bob@example.com", ["jane@example.com"])).toBe(false);
  });
});
