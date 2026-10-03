import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_SECRET } from "./support/constants";

// The suite runs the production build against the officeorg_e2e database (see docker/postgres/init.sql).
// Global setup migrates it once. Each spec reseeds it in beforeEach, so specs don't depend on order.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgres://officeorg:officeorg@localhost:5432/officeorg_e2e";

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]],
  outputDir: "../test-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm --filter @officeorg/web build && pnpm --filter @officeorg/web start -H localhost -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: E2E_AUTH_SECRET,
      AUTH_URL: BASE_URL,
      AUTH_PROVIDERS: "google",
      AUTH_GOOGLE_ID: "e2e-placeholder",
      AUTH_GOOGLE_SECRET: "e2e-placeholder",
      COMPANY_DOMAIN: "example.com",
      ADMIN_EMAILS: "jane@example.com",
      // Set on purpose: auth.spec.ts checks a production build ignores them.
      AUTH_DEV_PASSWORD: "dev",
      AUTH_DEV_BYPASS_EMAIL: "jane@example.com",
    },
  },
});
