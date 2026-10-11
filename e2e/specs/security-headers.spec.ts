import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

const scriptNonce = (csp: string | undefined) =>
  /script-src [^;]*'nonce-([^']+)'/.exec(csp ?? "")?.[1];

// Headers from apps/web/next.config.ts. Checked on the public pages and on Better Auth's routes,
// which the proxy's matcher skips.
test.describe("security headers", () => {
  for (const path of ["/login", "/api/health", "/theme.css", "/api/auth/get-session"]) {
    test(`${path} can't be framed by another site and sends the hardening headers`, async ({
      request,
    }) => {
      const response = await request.get(path);
      const headers = response.headers();
      expect(headers["content-security-policy"]).toContain("frame-ancestors 'self'");
      expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
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

// The nonce-based script-src that proxy.ts adds to pages.
test.describe("script policy", () => {
  test("each page gets a fresh nonce, and every script it renders carries it", async ({
    request,
  }) => {
    const first = await request.get("/login");
    const csp = first.headers()["content-security-policy"];
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    const nonce = scriptNonce(csp);
    expect(nonce).toBeTruthy();

    const scripts = [...(await first.text()).matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);

    const second = await request.get("/login");
    expect(scriptNonce(second.headers()["content-security-policy"])).not.toBe(nonce);
  });

  test("API routes keep their own policy", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.headers()["content-security-policy"]).not.toContain("script-src");
  });

  // Markup that reached the page unescaped, as stored XSS would, keeping the server's headers. Also
  // shows the console message the violation check below listens for.
  test("an injected inline script or handler doesn't run", async ({ page }) => {
    await page.route("**/login", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        "<body",
        `<img src="/x" onerror="window.__handler = true"><script>window.__inline = true</script><body`,
      );
      await route.fulfill({ response, body });
    });
    const refused = page.waitForEvent("console", (msg) =>
      msg.text().includes("Content Security Policy"),
    );
    await page.goto("/login");
    await refused;
    await page.waitForLoadState("networkidle");
    const ran = await page.evaluate(() => {
      const w = window as { __inline?: boolean; __handler?: boolean };
      return { inline: w.__inline ?? false, handler: w.__handler ?? false };
    });
    expect(ran).toEqual({ inline: false, handler: false });
  });

  test("the main views and admin pages run without a policy violation", async ({
    page,
    context,
  }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("Content Security Policy")) violations.push(msg.text());
    });
    for (const path of [
      "/directory?person=p_bob",
      "/map?loc=sf&floor=2&person=p_sam",
      "/org",
      "/admin/branding",
      "/admin/floors/fl_sf_2",
      "/admin/people/p_bob",
    ]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(violations).toEqual([]);
  });
});
