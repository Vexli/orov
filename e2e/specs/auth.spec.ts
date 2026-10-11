import { expect, test } from "@playwright/test";

// The e2e server is a production build with AUTH_DEV_PASSWORD and AUTH_DEV_BYPASS_EMAIL set
// (see playwright.config.ts). Neither may have any effect there.
test.describe("sign-in in a production build", () => {
  test("a signed-out visitor is sent to the login page, not signed in automatically", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  });

  test("Sign in with Google goes to Google, with the callback URL deployments registered", async ({
    page,
    baseURL,
  }) => {
    // Stand in for Google, so the test needs no network.
    await page.route("https://accounts.google.com/**", (route) =>
      route.fulfill({ body: "Google" }),
    );
    await page.goto("/login");
    const [request] = await Promise.all([
      page.waitForRequest(/^https:\/\/accounts\.google\.com\//),
      page.getByRole("button", { name: "Sign in with Google" }).click(),
    ]);
    const params = new URL(request.url()).searchParams;
    expect(params.get("redirect_uri")).toBe(`${baseURL}/api/auth/callback/google`);
    expect(params.get("hd")).toBe("example.com");
    expect(params.get("state")).toBeTruthy();
  });

  test("the login page offers no development sign-in", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Local development only")).toHaveCount(0);
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Continue as/ })).toHaveCount(0);
  });

  test("the bypass route does not exist", async ({ request }) => {
    const response = await request.get("/dev/sign-in", { maxRedirects: 0 });
    expect(response.status()).toBe(404);
  });

  test("the development sign-in endpoint is not served", async ({ request, baseURL }) => {
    const response = await request.post("/api/auth/dev-sign-in", {
      headers: { origin: baseURL! },
      data: { method: "dev-bypass" },
    });
    expect(response.status()).toBe(404);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });

  test("email and password sign-in is off", async ({ request, baseURL }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      headers: { origin: baseURL! },
      data: { email: "jane@example.com", password: "dev" },
    });
    expect(response.ok()).toBe(false);
    expect(response.headers()["set-cookie"] ?? "").not.toContain("session_token");
  });

  test("only the configured provider can start a sign-in", async ({ request, baseURL }) => {
    const start = (provider: string) =>
      request.post("/api/auth/sign-in/social", {
        headers: { origin: baseURL! },
        data: { provider, callbackURL: "/" },
      });
    const google = await start("google");
    expect(google.ok()).toBe(true);
    expect(new URL((await google.json()).url).hostname).toBe("accounts.google.com");
    expect((await start("oidc")).ok()).toBe(false);
  });
});
