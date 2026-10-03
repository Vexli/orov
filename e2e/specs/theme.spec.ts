import { expect, test, type Page } from "@playwright/test";
import { applyTheme, saveBrandAsset } from "@officeorg/db/queries/theme";
import { resetE2eDatabase, withE2eDb } from "../support/database";
import { signInAs } from "../support/session";

// A 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

// Applies a brand theme with a logo, as the Branding page would, straight through the database.
async function applyBrandTheme() {
  return withE2eDb(async (db) => {
    const logo = await saveBrandAsset(db, "jane@example.com", {
      kind: "logo_light",
      mime: "image/png",
      bytes: PNG,
      meta: { fileName: "acme.png" },
    });
    await applyTheme(
      db,
      "jane@example.com",
      {
        files: [
          { name: "acme.tokens.json", content: { brand: { $type: "color", $value: "#0052c8" } } },
        ],
        mapping: {
          primary: { token: "brand" },
          appName: { light: "Acme Office" },
          "logo.light": { light: logo.id },
        },
        darkMode: false,
        fonts: [],
      },
      { overrideContrast: false },
    );
    return logo.id;
  });
}

test.describe("theme serving", () => {
  test.beforeEach(async () => {
    await resetE2eDatabase();
  });

  test("/theme.css serves the defaults to anyone, cacheable by version and ETag", async ({
    request,
    page,
  }) => {
    const response = await request.get("/theme.css");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/css");
    expect(response.headers()["cache-control"]).toBe("no-cache");
    const css = await response.text();
    expect(css).toContain("--primary: #171717;");

    const etag = response.headers()["etag"]!;
    const again = await request.get("/theme.css", { headers: { "If-None-Match": etag } });
    expect(again.status()).toBe(304);

    // The page links a versioned URL, which is cached for good.
    await page.goto("/login");
    const href = await page
      .locator('link[rel="stylesheet"][href^="/theme.css"]')
      .getAttribute("href");
    expect(href).toMatch(/^\/theme\.css\?v=[0-9a-f]{16}$/);
    const versioned = await request.get(href!);
    expect(versioned.headers()["cache-control"]).toContain("immutable");
  });

  test("an applied theme restyles every view, names the app and shows the logo", async ({
    context,
    page,
  }) => {
    const logoId = await applyBrandTheme();
    await signInAs(context, "bob@example.com");

    for (const path of ["/directory", "/map", "/org"]) {
      await page.goto(path);
      expect(await cssVar(page, "--primary"), path).toBe("#0052c8");
      await expect(page).toHaveTitle("Acme Office");
      const logo = page.getByRole("banner").getByRole("img", { name: "Acme Office" });
      await expect(logo).toHaveAttribute("src", `/api/brand-assets/${logoId}`);
      expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    }
    // A light-only theme stays light whatever the viewer's setting.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/directory");
    expect(await cssVar(page, "--bg")).toBe("#ffffff");
  });

  test("the sign-in page is themed before anyone signs in", async ({ page }) => {
    await applyBrandTheme();
    await page.goto("/login");
    expect(await cssVar(page, "--primary")).toBe("#0052c8");
    await expect(page.getByRole("heading", { name: "Acme Office" })).toBeVisible();
  });

  test("brand assets are served with safe headers, and unknown ids are 404", async ({
    request,
  }) => {
    const logoId = await applyBrandTheme();
    const response = await request.get(`/api/brand-assets/${logoId}`);
    expect(response.status()).toBe(200);
    expect(response.headers()).toMatchObject({
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable",
    });
    expect((await request.get("/api/brand-assets/ba_doesnotexist000")).status()).toBe(404);
    expect((await request.get("/api/brand-assets/..%2F..%2Fetc")).status()).toBe(404);
  });
});
