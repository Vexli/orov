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

  test("the credentials providers are not registered", async ({ request }) => {
    const providers = await (await request.get("/api/auth/providers")).json();
    expect(Object.keys(providers)).toEqual(["google"]);
  });
});
