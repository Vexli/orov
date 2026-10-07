import { expect, test } from "@playwright/test";

// Headers from apps/web/next.config.ts. Checked on the public pages and on Better Auth's routes,
// which the proxy's matcher skips.
test.describe("security headers", () => {
  for (const path of ["/login", "/api/health", "/theme.css", "/api/auth/get-session"]) {
    test(`${path} can't be framed and sends the hardening headers`, async ({ request }) => {
      const response = await request.get(path);
      const headers = response.headers();
      expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["strict-transport-security"]).toContain("max-age=");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["x-powered-by"]).toBeUndefined();
    });
  }

  test("a page framed by another site is blocked", async ({ page, baseURL }) => {
    // Plain http, so mixed-content blocking can't be what stops the frame.
    await page.route("http://attacker.test/", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<iframe src="${baseURL}/login"></iframe>`,
      }),
    );
    await page.goto("http://attacker.test/");
    // Chromium replaces a refused frame with its error page; an allowed one would stay on /login.
    await expect
      .poll(
        () =>
          page
            .frames()
            .find((f) => f !== page.mainFrame())
            ?.url() ?? "",
      )
      .toMatch(/^chrome-error:/);
  });
});
