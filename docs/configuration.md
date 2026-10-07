# Configuration reference

Every setting OrOv reads, all from environment variables. For local development, copy
[`.env.example`](../.env.example) to `apps/web/.env.local`; in a deployment, set them on the
containers and keep secrets in the host's secret store.

The web app reads all of these. The worker reads `DATABASE_URL` (once it has jobs) and the
integration settings. The database scripts (`pnpm db:migrate`, `pnpm db:seed`) read
`DATABASE_URL` from the shell, not from `.env.local`.

## Required

| Variable         | Example                                    | What it does                                                                                                                                               |
| ---------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | `postgres://orov:orov@localhost:5432/orov` | Postgres 16 or later. The user must be allowed to `CREATE EXTENSION pg_trgm` (a migration does it; managed Postgres such as Cloud SQL and RDS allows it).  |
| `AUTH_URL`       | `https://orov.example.com`                 | The app's public URL. Sign-in callbacks are `$AUTH_URL/api/auth/callback/<provider>`.                                                                      |
| `AUTH_SECRET`    | output of `openssl rand -base64 32`        | Signs session cookies and encrypts the provider tokens stored with each account. Changing it signs everyone out.                                           |
| `COMPANY_DOMAIN` | `example.com`                              | Only accounts with an email on this domain can sign in. One domain per deployment.                                                                         |
| `ADMIN_EMAILS`   | `you@example.com,it@example.com`           | Comma-separated. These accounts are made admins on their next sign-in. Everyone else is a viewer until an admin promotes them; roles live in the database. |
| `AUTH_PROVIDERS` | `google`                                   | Comma-separated sign-in providers: `google`, `microsoft-entra-id`, `okta`, `cognito`, `oidc`. Each needs its own variables below.                          |

## Sign-in providers

Set the variables for each provider listed in `AUTH_PROVIDERS`. If a listed provider's variables are
missing, sign-in fails with an error naming them.

Register `$AUTH_URL/api/auth/callback/<provider>` as the redirect URI with each provider, where
`<provider>` is the id above (for example `/api/auth/callback/okta`). Sign-in is handled by
[Better Auth](https://www.better-auth.com); sessions are stored in the database, last 7 days and
are extended once a day while in use. Signing out ends the session immediately.

The email is who someone is in OrOv, and whether they're an admin. When a sign-in brings an email
that already has a user (through a second provider, or the same provider after the account was
recreated there), it joins that user only if the provider reports `email_verified=true`; otherwise
the sign-in is refused and the login page asks the person to contact an admin.

| Provider             | Variables                                                                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `google`             | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                                                              | Google Workspace. The account's `hd` claim must equal `COMPANY_DOMAIN`, and its email must be verified.                                                                                                                                                                                                                                                                                                                                                   |
| `microsoft-entra-id` | `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ISSUER`                    | The issuer must name your tenant by its **GUID** (`https://login.microsoftonline.com/<tenant-id>/v2.0`); `/common/`, `/organizations/`, `/consumers/` and domain-style tenant names are refused. The app registration must include the optional `email` claim.                                                                                                                                                                                            |
| `okta`               | `AUTH_OKTA_ID`, `AUTH_OKTA_SECRET`, `AUTH_OKTA_ISSUER`                                                              | Issuer: `https://<your-org>.okta.com`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `cognito`            | `AUTH_COGNITO_ID`, `AUTH_COGNITO_SECRET`, `AUTH_COGNITO_ISSUER`                                                     | An AWS Cognito user pool, which is also how to federate AWS IAM Identity Center or another SAML identity provider.                                                                                                                                                                                                                                                                                                                                        |
| `oidc`               | `AUTH_OIDC_ID`, `AUTH_OIDC_SECRET`, `AUTH_OIDC_ISSUER`, optional `AUTH_OIDC_NAME`, optional `AUTH_OIDC_TRUST_EMAIL` | Any other OpenID Connect issuer (Auth0, Keycloak, OneLogin, JumpCloud, PingOne, …). `AUTH_OIDC_NAME` labels the button; the default is "Single sign-on". The issuer must send `email_verified=true`. `AUTH_OIDC_TRUST_EMAIL=true` accepts a missing claim; set it only if people can't sign themselves up or change their own email at the issuer, because anyone who can choose their email can claim an admin's. An explicit `false` is always refused. |

## Local development only

These have **no effect** unless the app runs under `next dev` with a `localhost` `AUTH_URL`, so they
can't open a production build. Emails must still be on `COMPANY_DOMAIN`.

| Variable                | Example           | What it does                                                                                                                   |
| ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `AUTH_DEV_PASSWORD`     | `dev`             | Adds an email + password form to `/login`. Any company email works with this password, so you can sign in as different people. |
| `AUTH_DEV_BYPASS_EMAIL` | `you@example.com` | Skips the login page: signed-out requests are signed in as this email automatically.                                           |

## Theme

| Variable            | Default                 | What it does                                                                                                                                                                                                                                                    |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `THEME_TOKENS_PATH` | unset (OrOv's defaults) | A DTCG token file whose token paths are slot names, such as a theme exported from the Branding page. It is the theme served until an admin applies one. A file that fails to load is logged and the built-in defaults are used. See [`theming.md`](theming.md). |

## Integrations

No real chat, calendar or room provider ships yet; these exist so that the configuration is fixed
before the first one arrives. See [`integrations/README.md`](integrations/README.md).

| Variable             | Default | What it does                                                                   |
| -------------------- | ------- | ------------------------------------------------------------------------------ |
| `MESSAGING_PROVIDER` | `none`  | The chat tool's provider id.                                                   |
| `CALENDAR_PROVIDER`  | `none`  | The calendar's provider id.                                                    |
| `ROOMS_PROVIDER`     | `none`  | The room-status provider's id.                                                 |
| `INTEGRATIONS`       | unset   | `fake` uses the in-memory fakes for all three, overriding the variables above. |

The worker refuses to start with an unknown provider id, naming the variable and the valid ids.
Each real provider will add its own variables, prefixed with its id, to this page.

## Tests

| Variable                                      | Used by         | What it does                                                                                                    |
| --------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| `DOCKER_HOST`, `TESTCONTAINERS_RYUK_DISABLED` | database tests  | On macOS with Colima: `DOCKER_HOST=unix://$HOME/.colima/default/docker.sock TESTCONTAINERS_RYUK_DISABLED=true`. |
| `E2E_DATABASE_URL`                            | `pnpm test:e2e` | Default `postgres://orov:orov@localhost:5432/orov_e2e`, created by `pnpm db:up`.                                |
| `E2E_PORT`                                    | `pnpm test:e2e` | Default `3100`. Locally, a server already running on this port is reused rather than rebuilt.                   |
