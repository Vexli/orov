import { describe, expect, it } from "vitest";
import {
  assertTenantScopedEntraIssuer,
  canSignIn,
  devAuthAllowed,
  isBootstrapAdmin,
  parseSsoProviders,
} from "./policy";

const DOMAIN = "example.com";
const PROD = { devAuth: false };
const DEV = { devAuth: true };

describe("canSignIn with Google", () => {
  const google = (p: { email: string; emailVerified?: boolean; hd?: string }) => ({
    provider: "google",
    ...p,
  });

  it("accepts a verified company account", () => {
    expect(
      canSignIn(
        google({ email: "jane@example.com", emailVerified: true, hd: "example.com" }),
        DOMAIN,
        PROD,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects an unverified email even on the right domain", () => {
    const d = canSignIn(
      google({ email: "jane@example.com", emailVerified: false, hd: "example.com" }),
      DOMAIN,
      PROD,
    );
    expect(d).toEqual({ ok: false, reason: "email is not verified" });
  });

  it("rejects a missing email_verified claim", () => {
    const d = canSignIn(google({ email: "jane@example.com", hd: "example.com" }), DOMAIN, PROD);
    expect(d).toEqual({ ok: false, reason: "email is not verified" });
  });

  it("rejects a consumer account with no hd claim", () => {
    const d = canSignIn(google({ email: "jane@gmail.com", emailVerified: true }), DOMAIN, PROD);
    expect(d.ok).toBe(false);
  });

  it("rejects a Workspace account from another domain", () => {
    const d = canSignIn(
      google({ email: "jane@other.com", emailVerified: true, hd: "other.com" }),
      DOMAIN,
      PROD,
    );
    expect(d.ok).toBe(false);
  });

  it("rejects when hd matches but the email address does not", () => {
    const d = canSignIn(
      google({ email: "jane@evil.com", emailVerified: true, hd: "example.com" }),
      DOMAIN,
      PROD,
    );
    expect(d).toEqual({ ok: false, reason: "email domain does not match" });
  });
});

describe("canSignIn with tenant-scoped providers", () => {
  it.each(["microsoft-entra-id", "okta", "cognito", "oidc"])(
    "%s accepts a company email without email_verified",
    (provider) => {
      expect(canSignIn({ provider, email: "jane@example.com" }, DOMAIN, PROD)).toEqual({
        ok: true,
      });
    },
  );

  it("accepts Cognito's string-typed email_verified", () => {
    expect(
      canSignIn(
        { provider: "cognito", email: "jane@example.com", emailVerified: "true" },
        DOMAIN,
        PROD,
      ),
    ).toEqual({ ok: true });
  });

  it("rejects an explicitly unverified email", () => {
    const d = canSignIn(
      { provider: "okta", email: "jane@example.com", emailVerified: "false" },
      DOMAIN,
      PROD,
    );
    expect(d).toEqual({ ok: false, reason: "email is not verified" });
  });

  it("rejects an email outside the company domain", () => {
    const d = canSignIn({ provider: "microsoft-entra-id", email: "jane@other.com" }, DOMAIN, PROD);
    expect(d).toEqual({ ok: false, reason: "email domain does not match" });
  });

  it("rejects an unknown provider", () => {
    expect(canSignIn({ provider: "github", email: "jane@example.com" }, DOMAIN, PROD)).toEqual({
      ok: false,
      reason: "unknown provider",
    });
  });
});

describe("canSignIn with development providers", () => {
  it.each(["dev-password", "dev-bypass"])(
    "%s is rejected when development sign-in is off",
    (provider) => {
      expect(canSignIn({ provider, email: "jane@example.com" }, DOMAIN, PROD)).toEqual({
        ok: false,
        reason: "development sign-in is disabled",
      });
    },
  );

  it("still enforces the company domain in development", () => {
    expect(canSignIn({ provider: "dev-password", email: "jane@example.com" }, DOMAIN, DEV)).toEqual(
      { ok: true },
    );
    expect(canSignIn({ provider: "dev-bypass", email: "jane@other.com" }, DOMAIN, DEV).ok).toBe(
      false,
    );
  });
});

describe("devAuthAllowed", () => {
  it("allows next dev on a loopback AUTH_URL", () => {
    expect(devAuthAllowed({ NODE_ENV: "development", AUTH_URL: "http://localhost:3000" })).toBe(
      true,
    );
    expect(devAuthAllowed({ NODE_ENV: "development", AUTH_URL: "http://127.0.0.1:3000" })).toBe(
      true,
    );
    expect(devAuthAllowed({ NODE_ENV: "development", AUTH_URL: "http://[::1]:3000" })).toBe(true);
    expect(
      devAuthAllowed({ NODE_ENV: "development", AUTH_URL: "http://officeorg.localhost:3000" }),
    ).toBe(true);
  });

  it("refuses production builds even on localhost", () => {
    expect(devAuthAllowed({ NODE_ENV: "production", AUTH_URL: "http://localhost:3000" })).toBe(
      false,
    );
  });

  it("refuses next dev on a public host", () => {
    expect(
      devAuthAllowed({ NODE_ENV: "development", AUTH_URL: "https://office.example.com" }),
    ).toBe(false);
    expect(
      devAuthAllowed({ NODE_ENV: "development", AUTH_URL: "https://localhost.example.com" }),
    ).toBe(false);
  });

  it("refuses a missing or malformed AUTH_URL", () => {
    expect(devAuthAllowed({ NODE_ENV: "development" })).toBe(false);
    expect(devAuthAllowed({ NODE_ENV: "development", AUTH_URL: "not a url" })).toBe(false);
  });
});

describe("parseSsoProviders", () => {
  it("parses, normalizes and dedupes the list", () => {
    expect(parseSsoProviders(" Google, okta ,google")).toEqual(["google", "okta"]);
  });

  it("treats unset or blank as no providers", () => {
    expect(parseSsoProviders(undefined)).toEqual([]);
    expect(parseSsoProviders(" , ")).toEqual([]);
  });

  it("rejects unknown ids", () => {
    expect(() => parseSsoProviders("google,github")).toThrow(/github/);
  });
});

describe("assertTenantScopedEntraIssuer", () => {
  it("accepts a tenant-specific issuer", () => {
    const issuer = "https://login.microsoftonline.com/0b1c2d3e-0000-0000-0000-000000000000/v2.0";
    expect(assertTenantScopedEntraIssuer(issuer)).toBe(issuer);
  });

  it.each(["common", "organizations", "consumers"])(
    "rejects the multi-tenant %s endpoint",
    (segment) => {
      expect(() =>
        assertTenantScopedEntraIssuer(`https://login.microsoftonline.com/${segment}/v2.0`),
      ).toThrow(/tenant/);
    },
  );

  it("rejects a missing issuer", () => {
    expect(() => assertTenantScopedEntraIssuer(undefined)).toThrow(/required/);
  });
});

describe("isBootstrapAdmin", () => {
  it("matches case-insensitively and ignores whitespace in the env list", () => {
    expect(isBootstrapAdmin("Jane@Example.com", [" jane@example.com "])).toBe(true);
    expect(isBootstrapAdmin("bob@example.com", ["jane@example.com"])).toBe(false);
  });
});
