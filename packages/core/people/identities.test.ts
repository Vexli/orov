import { describe, expect, it } from "vitest";
import { identitiesInputSchema, selfProfileSchema } from "./form";
import { identityLinks, parseIdentity } from "./identities";

describe("parseIdentity", () => {
  it.each([
    ["github", "octocat", "octocat"],
    ["github", "@OctoCat", "octocat"],
    ["github", "https://github.com/octocat", "octocat"],
    ["github", "github.com/octocat/", "octocat"],
    ["github", "https://www.github.com/octocat/repo", "octocat"],
    ["gitlab", "https://gitlab.com/some.user", "some.user"],
    ["linkedin", "https://www.linkedin.com/in/jane-doe-123/", "jane-doe-123"],
    ["linkedin", "jane-doe", "jane-doe"],
    ["website", "jane.example.com", "https://jane.example.com/"],
    ["website", "http://jane.example.com/blog", "http://jane.example.com/blog"],
  ])("%s accepts %s", (provider, raw, value) => {
    expect(parseIdentity(provider, raw)).toEqual({ ok: true, value });
  });

  it.each([
    ["github", "https://gitlab.com/octocat"],
    ["github", "octo--cat"],
    ["github", "-octocat"],
    ["github", "javascript:alert(1)"],
    ["linkedin", "https://www.linkedin.com/company/acme"],
    ["website", "javascript:alert(1)"],
    ["website", "ftp://example.com"],
    ["website", "https://user:pw@example.com"],
    ["website", "localhost"],
  ])("%s rejects %s", (provider, raw) => {
    expect(parseIdentity(provider, raw).ok).toBe(false);
  });

  it("treats blank as no value", () => {
    expect(parseIdentity("github", "  ")).toEqual({ ok: true, value: null });
    expect(parseIdentity("github", null)).toEqual({ ok: true, value: null });
  });

  it("rejects an unknown provider", () => {
    expect(parseIdentity("myspace", "tom").ok).toBe(false);
  });
});

describe("identityLinks", () => {
  it("builds links in registry order", () => {
    expect(identityLinks({ website: "https://a.example/", github: "octocat" })).toEqual([
      { provider: "github", label: "GitHub", value: "octocat", url: "https://github.com/octocat" },
      { provider: "website", label: "Website", value: "https://a.example/", url: "https://a.example/" },
    ]);
  });

  it("leaves out messaging ids, which have no public link", () => {
    expect(identityLinks({ chat: "U123ABC" })).toEqual([]);
  });

  it("ignores providers it doesn't know", () => {
    expect(identityLinks({ myspace: "tom" })).toEqual([]);
  });
});

describe("identitiesInputSchema", () => {
  it("normalizes profile accounts and drops blanks", () => {
    expect(identitiesInputSchema.parse({ github: "@Octo", linkedin: "" })).toEqual({ github: "octo" });
  });

  it("refuses messaging ids, which only a match job writes", () => {
    const result = identitiesInputSchema.safeParse({ chat: "U123ABC" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["chat"]);
  });
});

describe("selfProfileSchema", () => {
  it("drops fields a person can't change about themself, even if a request sends them", () => {
    const parsed = selfProfileSchema.parse({
      preferredName: "Bobby",
      phone: null,
      homeTimezone: null,
      identities: {},
      title: "CEO",
      managerIds: ["p_bob"],
      active: false,
    });
    expect(Object.keys(parsed).sort()).toEqual(["homeTimezone", "identities", "phone", "preferredName"]);
  });
});
