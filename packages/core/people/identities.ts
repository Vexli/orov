// Other accounts a person has. The providers listed here are profile links (GitHub, LinkedIn, …)
// that admins and the person edit. Messaging-tool user ids are stored in the same table under the
// configured messaging provider's id; they are written by that provider's match job and validated
// by its adapter (packages/integrations), so no messaging tool is listed here. Every URL shown for
// an identity is built here from the normalized value, never from what someone typed.

export type IdentityKind = "profile" | "messaging";

export interface IdentityProvider {
  id: string;
  label: string;
  kind: IdentityKind;
  // Shown under the input, e.g. "Username or profile URL".
  inputHint: string;
  // The stored form of a value, or null if it isn't one this provider accepts.
  normalize(raw: string): string | null;
  // The link for a stored value, or null when the provider has no public page.
  url(value: string): string | null;
}

// A value typed as a bare handle ("octocat", "@octocat") or as a profile URL on one of `hosts`.
// Returns the first path segment after `prefix` (e.g. "/in/" for LinkedIn).
function handleFrom(raw: string, hosts: string[], prefix = "/"): string | null {
  const value = raw.trim();
  if (value === "") return null;
  if (!value.includes("/") && !value.includes(".")) return value.replace(/^@/, "");
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!hosts.includes(url.hostname.toLowerCase())) return null;
  if (!url.pathname.toLowerCase().startsWith(prefix)) return null;
  const segment = url.pathname.slice(prefix.length).split("/")[0] ?? "";
  return decodeURIComponent(segment).replace(/^@/, "") || null;
}

const matching = (pattern: RegExp) => (handle: string | null) =>
  handle !== null && pattern.test(handle) ? handle.toLowerCase() : null;

// GitHub usernames: letters, digits and single hyphens, at most 39 characters.
const githubHandle = matching(/^[a-z0-9](?:-?[a-z0-9]){0,38}$/i);
const gitlabHandle = matching(/^[a-z0-9_][a-z0-9_.-]{0,254}$/i);
const linkedinHandle = matching(/^[a-z0-9][a-z0-9_-]{1,99}$/i);

function websiteUrl(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".") || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export const IDENTITY_PROVIDERS: readonly IdentityProvider[] = [
  {
    id: "github",
    label: "GitHub",
    kind: "profile",
    inputHint: "Username or github.com URL",
    normalize: (raw) => githubHandle(handleFrom(raw, ["github.com", "www.github.com"])),
    url: (value) => `https://github.com/${encodeURIComponent(value)}`,
  },
  {
    id: "gitlab",
    label: "GitLab",
    kind: "profile",
    inputHint: "Username or gitlab.com URL",
    normalize: (raw) => gitlabHandle(handleFrom(raw, ["gitlab.com", "www.gitlab.com"])),
    url: (value) => `https://gitlab.com/${encodeURIComponent(value)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    kind: "profile",
    inputHint: "Profile name or linkedin.com/in/ URL",
    normalize: (raw) =>
      linkedinHandle(handleFrom(raw, ["linkedin.com", "www.linkedin.com"], "/in/")),
    url: (value) => `https://www.linkedin.com/in/${encodeURIComponent(value)}`,
  },
  {
    id: "website",
    label: "Website",
    kind: "profile",
    inputHint: "https://…",
    normalize: websiteUrl,
    url: (value) => websiteUrl(value),
  },
];

export const PROFILE_PROVIDERS = IDENTITY_PROVIDERS.filter((p) => p.kind === "profile");
export const PROFILE_PROVIDER_IDS = PROFILE_PROVIDERS.map((p) => p.id);

export function identityProvider(id: string): IdentityProvider | undefined {
  return IDENTITY_PROVIDERS.find((p) => p.id === id);
}

// Provider id → stored value. Absent keys mean "none".
export type Identities = Record<string, string>;

export type IdentityParse = { ok: true; value: string | null } | { ok: false; message: string };

// Blank clears the identity; anything else must normalize.
export function parseIdentity(providerId: string, raw: string | null | undefined): IdentityParse {
  const provider = identityProvider(providerId);
  if (!provider) return { ok: false, message: `unknown account type "${providerId}"` };
  if (raw === null || raw === undefined || raw.trim() === "") return { ok: true, value: null };
  const value = provider.normalize(raw);
  return value === null
    ? { ok: false, message: `${provider.label} is not valid (${provider.inputHint})` }
    : { ok: true, value };
}

export interface IdentityLink {
  provider: string;
  label: string;
  value: string;
  url: string;
}

// Links for the person card, in registry order. Values with no URL are left out.
export function identityLinks(identities: Identities): IdentityLink[] {
  const links: IdentityLink[] = [];
  for (const provider of IDENTITY_PROVIDERS) {
    const value = identities[provider.id];
    if (!value) continue;
    const url = provider.url(value);
    if (url) links.push({ provider: provider.id, label: provider.label, value, url });
  }
  return links;
}

// Same keys and values, regardless of insertion order.
export function sameIdentities(a: Identities, b: Identities): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? null) !== (b[key] ?? null)) return false;
  return true;
}
