import type { Provider } from "next-auth/providers";
import Cognito from "next-auth/providers/cognito";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Okta from "next-auth/providers/okta";
import {
  assertTenantScopedEntraIssuer,
  devAuthAllowed,
  parseSsoProviders,
  type SsoProviderId,
} from "@orov/core/auth/policy";

// Edge-safe: the proxy imports this, so nothing here may touch the database driver.

export interface LoginOption {
  id: string;
  name: string;
}

export interface AuthSetup {
  providers: Provider[];
  sso: LoginOption[];
  devAuth: boolean;
  devPassword: boolean;
  devBypassEmail: string | null;
}

function requireEnv(...names: string[]) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length > 0) throw new Error(`Sign-in is misconfigured: set ${missing.join(", ")}`);
}

// Client ids, secrets and issuers are read by Auth.js from AUTH_<ID>_ID/_SECRET/_ISSUER.
const SSO_PROVIDERS: Record<SsoProviderId, () => Provider> = {
  google: () => {
    requireEnv("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET");
    return Google({
      // Hint only. The real check is the hd claim in canSignIn, because a hint can be ignored.
      authorization: { params: { hd: process.env.COMPANY_DOMAIN, prompt: "select_account" } },
    });
  },
  "microsoft-entra-id": () => {
    requireEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "AUTH_MICROSOFT_ENTRA_ID_SECRET");
    // The provider silently falls back to the multi-tenant /common/ issuer when this is unset.
    const issuer = assertTenantScopedEntraIssuer(process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);
    return MicrosoftEntraID({ issuer });
  },
  okta: () => {
    requireEnv("AUTH_OKTA_ID", "AUTH_OKTA_SECRET", "AUTH_OKTA_ISSUER");
    return Okta({});
  },
  cognito: () => {
    requireEnv("AUTH_COGNITO_ID", "AUTH_COGNITO_SECRET", "AUTH_COGNITO_ISSUER");
    return Cognito({});
  },
  // Any other OpenID Connect provider: Auth0, Keycloak, OneLogin, JumpCloud, PingOne, ...
  oidc: () => {
    requireEnv("AUTH_OIDC_ID", "AUTH_OIDC_SECRET", "AUTH_OIDC_ISSUER");
    return {
      id: "oidc",
      name: process.env.AUTH_OIDC_NAME || "Single sign-on",
      type: "oidc",
      issuer: process.env.AUTH_OIDC_ISSUER,
      clientId: process.env.AUTH_OIDC_ID,
      clientSecret: process.env.AUTH_OIDC_SECRET,
    };
  },
};

function normalizeEmail(value: unknown): string | null {
  return typeof value === "string" && value.includes("@") ? value.trim().toLowerCase() : null;
}

function buildAuthSetup(): AuthSetup {
  const sso = parseSsoProviders(process.env.AUTH_PROVIDERS).map((id) => SSO_PROVIDERS[id]());

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

  const dev: Provider[] = [];
  if (devPassword) {
    dev.push(
      Credentials({
        id: "dev-password",
        name: "Development password",
        credentials: { email: { type: "email" }, password: { type: "password" } },
        authorize(credentials) {
          const email = normalizeEmail(credentials?.email);
          if (!email || credentials?.password !== devPassword) return null;
          return { id: email, email };
        },
      }),
    );
  }
  if (devBypassEmail) {
    dev.push(
      Credentials({
        id: "dev-bypass",
        name: "Development bypass",
        credentials: {},
        authorize: () => ({ id: devBypassEmail, email: devBypassEmail }),
      }),
    );
  }

  const providers = [...sso, ...dev];
  if (providers.length === 0) {
    throw new Error(
      "No sign-in method is configured. Set AUTH_PROVIDERS, or for local development AUTH_DEV_PASSWORD or AUTH_DEV_BYPASS_EMAIL.",
    );
  }

  return {
    providers,
    sso: sso.map((p) => {
      const { id, name } = typeof p === "function" ? p() : p;
      return { id, name };
    }),
    devAuth,
    devPassword: devPassword !== null,
    devBypassEmail,
  };
}

let cached: AuthSetup | undefined;

// Built on first request rather than at import, because `next build` runs without runtime env.
export function getAuthSetup(): AuthSetup {
  cached ??= buildAuthSetup();
  return cached;
}
