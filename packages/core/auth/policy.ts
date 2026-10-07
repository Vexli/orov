// Sign-in policy, kept free of framework imports so it can be unit tested.

// Identity providers an organization can sign in with. Each is configured through
// AUTH_<ID>_ID / AUTH_<ID>_SECRET / AUTH_<ID>_ISSUER, where <ID> is the id upper-cased with
// dashes turned into underscores (apps/web/lib/auth-providers.ts reads them).
export const SSO_PROVIDER_IDS = [
  "google",
  "microsoft-entra-id",
  "okta",
  "cognito",
  "oidc",
] as const;
export type SsoProviderId = (typeof SSO_PROVIDER_IDS)[number];

// Sign-in methods that exist only for local development. They are never registered unless
// devAuthAllowed() is true, and canSignIn rejects them again if they somehow are.
export const DEV_PROVIDER_IDS = ["dev-password", "dev-bypass"] as const;
export type DevProviderId = (typeof DEV_PROVIDER_IDS)[number];

export interface SignInIdentity {
  provider: string;
  email: string;
  // The OIDC email_verified claim. Cognito's userinfo endpoint sends it as the string "true".
  emailVerified?: boolean | string | null;
  // Google sets `hd` only for Workspace accounts. Consumer accounts have no hd claim.
  hd?: string | null;
}

export type SignInDecision = { ok: true } | { ok: false; reason: string };

export function isDevProvider(provider: string): provider is DevProviderId {
  return (DEV_PROVIDER_IDS as readonly string[]).includes(provider);
}

function isSsoProvider(provider: string): provider is SsoProviderId {
  return (SSO_PROVIDER_IDS as readonly string[]).includes(provider);
}

function parseVerified(value: SignInIdentity["emailVerified"]): boolean | null {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

export interface SignInOptions {
  devAuth: boolean;
  // AUTH_OIDC_TRUST_EMAIL: the operator vouches that the generic OIDC issuer only hands out
  // emails it manages, so a missing email_verified claim is accepted from it.
  trustOidcEmail?: boolean;
}

export function canSignIn(
  identity: SignInIdentity,
  companyDomain: string,
  options: SignInOptions,
): SignInDecision {
  const domain = companyDomain.toLowerCase();
  const email = identity.email.toLowerCase();
  const verified = parseVerified(identity.emailVerified);

  if (isDevProvider(identity.provider)) {
    if (!options.devAuth) return { ok: false, reason: "development sign-in is disabled" };
  } else if (identity.provider === "google") {
    if (verified !== true) return { ok: false, reason: "email is not verified" };
    if (identity.hd?.toLowerCase() !== domain)
      return { ok: false, reason: "not a company account" };
  } else if (identity.provider === "oidc") {
    // Any OpenID Connect issuer. Many let people sign themselves up or change their own email,
    // and the email is who they are here (and whether they're an admin), so the issuer must say
    // it's verified. An explicit false is refused even when the operator trusts the issuer.
    if (verified === false) return { ok: false, reason: "email is not verified" };
    if (verified !== true && !options.trustOidcEmail)
      return { ok: false, reason: "email is not verified" };
  } else if (isSsoProvider(identity.provider)) {
    // These providers are pinned to the organization's own tenant, pool or issuer, so the
    // claim is often omitted rather than true. An explicit false still means unverified.
    if (verified === false) return { ok: false, reason: "email is not verified" };
  } else {
    return { ok: false, reason: "unknown provider" };
  }

  if (!email.endsWith(`@${domain}`)) return { ok: false, reason: "email domain does not match" };
  return { ok: true };
}

// Where a sign-in came from, in the shape Better Auth hands to user.validateUserInfo: the method
// ("oauth" for every SSO provider, or a development method), and for OAuth the provider id and
// its raw claims.
export interface SignInSource {
  method: string;
  oauth?: { providerId: string; profile?: Record<string, unknown> } | undefined;
}

// The identity canSignIn judges, read from the provider's own claims where there are any.
export function signInIdentity(email: unknown, source: SignInSource): SignInIdentity {
  const profile = source.oauth?.profile ?? {};
  const claimed =
    typeof email === "string" ? email : typeof profile.email === "string" ? profile.email : "";
  return {
    provider: source.method === "oauth" ? (source.oauth?.providerId ?? "") : source.method,
    email: claimed,
    emailVerified: profile.email_verified as SignInIdentity["emailVerified"],
    hd: typeof profile.hd === "string" ? profile.hd : null,
  };
}

// Parses AUTH_PROVIDERS, a comma-separated list of SSO provider ids. Empty means none.
export function parseSsoProviders(raw: string | undefined): SsoProviderId[] {
  const ids = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unknown = ids.filter((id) => !isSsoProvider(id));
  if (unknown.length > 0) {
    throw new Error(
      `AUTH_PROVIDERS has unknown provider(s): ${unknown.join(", ")}. Supported: ${SSO_PROVIDER_IDS.join(", ")}`,
    );
  }
  return [...new Set(ids)] as SsoProviderId[];
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Development sign-in needs both `next dev` and an AUTH_URL on this machine. NODE_ENV alone is
// not enough: a deployment run with `next dev` by mistake would still have a public AUTH_URL.
export function devAuthAllowed(env: { NODE_ENV?: string; AUTH_URL?: string }): boolean {
  if (env.NODE_ENV !== "development" || !env.AUTH_URL) return false;
  let host: string;
  try {
    host = new URL(env.AUTH_URL).hostname.toLowerCase();
  } catch {
    return false;
  }
  return LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost");
}

// AUTH_SECRET signs session cookies and encrypts the provider tokens Better Auth stores. Better
// Auth refuses only its own built-in default, so a deployment copied from .env.example would run
// on a secret anyone can read. `openssl rand -base64 32` gives 44 characters; a placeholder is
// refused whatever its length (.env.example's is 33).
export const MIN_AUTH_SECRET_LENGTH = 32;
const PLACEHOLDER_SECRET = /^(change[-_ ]?me|changeme|secret|password|example)/i;

export function assertStrongAuthSecret(secret: string | undefined): string {
  if (!secret)
    throw new Error("AUTH_SECRET is not set. Generate one with: openssl rand -base64 32");
  if (PLACEHOLDER_SECRET.test(secret))
    throw new Error(
      "AUTH_SECRET is still a placeholder. Generate one with: openssl rand -base64 32",
    );
  if (secret.length < MIN_AUTH_SECRET_LENGTH)
    throw new Error(
      `AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters. Generate one with: openssl rand -base64 32`,
    );
  return secret;
}

const MULTI_TENANT_ENTRA_SEGMENTS = new Set(["common", "organizations", "consumers"]);

// A multi-tenant Entra issuer accepts accounts from any tenant, whose `email` claim that
// tenant's users can set themselves. Only a tenant-specific issuer makes the domain check sound.
export function assertTenantScopedEntraIssuer(issuer: string | undefined): string {
  if (!issuer) {
    throw new Error(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER is required: https://login.microsoftonline.com/<tenant-id>/v2.0",
    );
  }
  let tenant: string | undefined;
  try {
    tenant = new URL(issuer).pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  } catch {
    throw new Error(`AUTH_MICROSOFT_ENTRA_ID_ISSUER is not a URL: ${issuer}`);
  }
  if (!tenant || MULTI_TENANT_ENTRA_SEGMENTS.has(tenant)) {
    throw new Error(
      "AUTH_MICROSOFT_ENTRA_ID_ISSUER must name your tenant, not common/organizations/consumers",
    );
  }
  return issuer;
}

// Admins are bootstrapped from ADMIN_EMAILS. Other people keep whatever role the database has.
export function isBootstrapAdmin(email: string, adminEmails: readonly string[]): boolean {
  const normalized = email.toLowerCase();
  return adminEmails.some((e) => e.trim().toLowerCase() === normalized);
}
