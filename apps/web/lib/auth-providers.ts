import { microsoftEntraId, okta, type GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import {
  assertTenantScopedEntraIssuer,
  devAuthAllowed,
  parseSsoProviders,
  type SsoProviderId,
} from "@orov/core/auth/policy";

// Which sign-in methods this deployment offers, from the environment (docs/configuration.md).
// The proxy and the login page import this, so nothing here may touch the database driver.

export interface LoginOption {
  id: string;
  name: string;
}

export interface AuthSetup {
  // Better Auth's built-in Google provider, when google is in AUTH_PROVIDERS.
  google: { clientId: string; clientSecret: string } | null;
  // Every other SSO provider, through Better Auth's generic OAuth plugin.
  genericOAuth: GenericOAuthConfig[];
  sso: LoginOption[];
  devAuth: boolean;
  // The shared development password, or null. Never sent to the browser.
  devPassword: string | null;
  devBypassEmail: string | null;
}

// The named settings' values, one per name, or an error naming the missing ones.
function requireEnv<const N extends readonly string[]>(...names: N): { [K in keyof N]: string } {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) throw new Error(`Sign-in is misconfigured: set ${missing.join(", ")}`);
  return names.map((n) => process.env[n]!) as { [K in keyof N]: string };
}

// An issuer's OpenID Connect discovery document.
const discovery = (issuer: string) =>
  `${issuer.replace(/\/+$/, "")}/.well-known/openid-configuration`;

const OIDC_SCOPES = ["openid", "email", "profile"];

type SsoProvider =
  | { kind: "google"; name: string; config: { clientId: string; clientSecret: string } }
  | { kind: "generic"; name: string; config: GenericOAuthConfig };

// Ids are the AUTH_PROVIDERS values. Each provider's callback URL is $AUTH_URL/api/auth/callback/<id>,
// the same as under Auth.js, so deployments keep the redirect URIs they registered.
const SSO_PROVIDERS: Record<SsoProviderId, () => SsoProvider> = {
  google: () => {
    const [clientId, clientSecret] = requireEnv("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET");
    return { kind: "google", name: "Google", config: { clientId, clientSecret } };
  },
  "microsoft-entra-id": () => {
    const [clientId, clientSecret] = requireEnv(
      "AUTH_MICROSOFT_ENTRA_ID_ID",
      "AUTH_MICROSOFT_ENTRA_ID_SECRET",
    );
    // A multi-tenant issuer would let any tenant's users through, so it is refused.
    const issuer = assertTenantScopedEntraIssuer(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);
    const tenantId = new URL(issuer).pathname.split("/").filter(Boolean)[0]!;
    return {
      kind: "generic",
      name: "Microsoft Entra ID",
      config: microsoftEntraId({ clientId, clientSecret, tenantId }),
    };
  },
  okta: () => {
    const [clientId, clientSecret, issuer] = requireEnv(
      "AUTH_OKTA_ID",
      "AUTH_OKTA_SECRET",
      "AUTH_OKTA_ISSUER",
    );
    return { kind: "generic", name: "Okta", config: okta({ clientId, clientSecret, issuer }) };
  },
  cognito: () => {
    const [clientId, clientSecret, issuer] = requireEnv(
      "AUTH_COGNITO_ID",
      "AUTH_COGNITO_SECRET",
      "AUTH_COGNITO_ISSUER",
    );
    return {
      kind: "generic",
      name: "Cognito",
      config: {
        providerId: "cognito",
        name: "Cognito",
        clientId,
        clientSecret,
        discoveryUrl: discovery(issuer),
        requireIdTokenVerification: true,
        scopes: OIDC_SCOPES,
      },
    };
  },
  // Any other OpenID Connect provider: Auth0, Keycloak, OneLogin, JumpCloud, PingOne, ...
  oidc: () => {
    const [clientId, clientSecret, issuer] = requireEnv(
      "AUTH_OIDC_ID",
      "AUTH_OIDC_SECRET",
      "AUTH_OIDC_ISSUER",
    );
    const name = process.env.AUTH_OIDC_NAME || "Single sign-on";
    return {
      kind: "generic",
      name,
      config: {
        providerId: "oidc",
        name,
        clientId,
        clientSecret,
        discoveryUrl: discovery(issuer),
        requireIdTokenVerification: true,
        scopes: OIDC_SCOPES,
      },
    };
  },
};

function normalizeEmail(value: unknown): string | null {
  return typeof value === "string" && value.includes("@") ? value.trim().toLowerCase() : null;
}

function buildAuthSetup(): AuthSetup {
  const ids = parseSsoProviders(process.env.AUTH_PROVIDERS);
  const sso = ids.map((id) => ({ id, ...SSO_PROVIDERS[id]() }));

  const devAuth = devAuthAllowed(process.env);
  const devPasswordValue = process.env.AUTH_DEV_PASSWORD || null;
  const devBypassValue = normalizeEmail(process.env.AUTH_DEV_BYPASS_EMAIL);
  if (!devAuth && (devPasswordValue || devBypassValue)) {
    console.warn(
      "AUTH_DEV_PASSWORD / AUTH_DEV_BYPASS_EMAIL are ignored: development sign-in needs `next dev` and a localhost AUTH_URL",
    );
  }
  const devPassword = devAuth ? devPasswordValue : null;
  const devBypassEmail = devAuth ? devBypassValue : null;

  if (sso.length === 0 && !devPassword && !devBypassEmail) {
    throw new Error(
      "No sign-in method is configured. Set AUTH_PROVIDERS, or for local development AUTH_DEV_PASSWORD or AUTH_DEV_BYPASS_EMAIL.",
    );
  }

  const google = sso.find((p) => p.kind === "google");
  return {
    google: google?.kind === "google" ? google.config : null,
    genericOAuth: sso.flatMap((p) => (p.kind === "generic" ? [p.config] : [])),
    sso: sso.map(({ id, name }) => ({ id, name })),
    devAuth,
    devPassword,
    devBypassEmail,
  };
}

let cached: AuthSetup | undefined;

// Built on first request rather than at import, because `next build` runs without runtime env.
export function getAuthSetup(): AuthSetup {
  cached ??= buildAuthSetup();
  return cached;
}
