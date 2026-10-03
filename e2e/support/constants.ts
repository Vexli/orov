// Shared by the Playwright config (which sets the server's AUTH_SECRET) and the session helper
// (which signs tokens with it). Not a real secret, and never used outside the e2e run.
export const E2E_AUTH_SECRET = "e2e-only-secret-not-used-anywhere-else-0123456789";
