import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

const fixture = (name: string) => ({
  name,
  mimeType: "application/json",
  buffer: readFileSync(new URL(`../../packages/core/theme/fixtures/${name}`, import.meta.url)),
});

// A 1×1 PNG.
const LOGO = {
  name: "acme.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  ),
};

const DEFAULT_PRIMARY = "#171717";

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

async function expectPrimaryEverywhere(page: Page, primary: string) {
  for (const path of ["/directory", "/map", "/org"]) {
    await page.goto(path);
    expect(await cssVar(page, "--primary"), path).toBe(primary);
  }
}

test.describe("branding (U12)", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
  });

  test("an admin imports the brand's tokens, maps, previews and applies them, and every view follows", async ({
    page,
  }) => {
    await page.goto("/admin/branding");
    await expect(page.getByRole("heading", { name: "Branding" })).toBeVisible();

    // Figma exports one file per mode.
    await page
      .getByLabel("Token files (JSON)")
      .setInputFiles([fixture("Light.tokens.json"), fixture("Dark.tokens.json")]);
    const files = page.getByRole("list", { name: "Imported token files" });
    await expect(files).toContainText("Light: light");
    await expect(files).toContainText("Dark: dark");
    await expect(page.getByRole("checkbox", { name: /dark-mode setting/ })).toBeChecked();

    // Suggestions from the token names.
    await expect(page.getByLabel("Source for primary", { exact: true })).toHaveValue(
      "token:color.action.primary",
    );
    await expect(page.getByLabel("Source for bg", { exact: true })).toHaveValue(
      "token:color.background.default",
    );
    // The admin maps what the names don't say.
    await page
      .getByLabel("Source for primary-fg", { exact: true })
      .selectOption("token:color.text.on-brand");

    await page.getByLabel("Upload logo.light (PNG or SVG)").setInputFiles(LOGO);
    await expect(page.getByRole("img", { name: "Current logo.light" })).toBeVisible();
    await page.getByLabel("Source for appName", { exact: true }).selectOption("custom");
    await page.getByLabel("appName value").fill("Acme Office");

    const contrast = page.getByRole("region", { name: "Contrast" });
    await expect(contrast.getByRole("status")).toHaveText(/All \d+ checks pass/);

    // The preview shows the draft in a real view before anything is saved.
    await expect(page.getByTitle("Preview of the directory")).toBeVisible();
    await expect
      .poll(async () => {
        const frame = page.frame({ url: /\/directory$/ });
        return frame
          ? frame.evaluate(() =>
              getComputedStyle(document.documentElement).getPropertyValue("--primary").trim(),
            )
          : null;
      })
      .toBe("#0052c8");

    await page.getByRole("button", { name: "Apply theme" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Applied" })).toHaveText(
      "Applied as version 1.",
    );

    for (const path of ["/directory", "/map", "/org"]) {
      await page.goto(path);
      expect(await cssVar(page, "--primary"), path).toBe("#0052c8");
      await expect(page).toHaveTitle("Acme Office");
      await expect(
        page.getByRole("banner").getByRole("img", { name: "Acme Office" }),
      ).toBeVisible();
    }
    // The dark values came along from the Dark file.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/directory");
    expect(await cssVar(page, "--primary")).toBe("#79a3ff");
    await page.emulateMedia({ colorScheme: "light" });

    // Export writes the theme back out as DTCG, named by slot.
    const exported = await (await page.request.get("/api/export/theme")).json();
    expect(exported.primary.$value.hex).toBe("#0052c8");
    expect(exported.primary.$extensions.mode.dark.hex).toBe("#79a3ff");
    expect(exported.appName.$value).toBe("Acme Office");

    // Editing again starts from the applied theme.
    await page.goto("/admin/branding");
    await expect(page.getByLabel("Source for primary", { exact: true })).toHaveValue(
      "token:color.action.primary",
    );

    // Back to the default, then roll forward to version 1 again.
    const versions = page.getByRole("region", { name: "Versions" });
    await expect(versions.getByRole("row", { name: /^1 current/ })).toBeVisible();
    await versions.getByRole("button", { name: "Use the default theme" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Now using" })).toHaveText(
      "Now using the default theme.",
    );
    await expectPrimaryEverywhere(page, DEFAULT_PRIMARY);

    await page.goto("/admin/branding");
    await page
      .getByRole("region", { name: "Versions" })
      .getByRole("button", { name: "Roll back to version 1" })
      .click();
    await expect(page.getByRole("status").filter({ hasText: "Now using" })).toHaveText(
      "Now using version 1.",
    );
    await expectPrimaryEverywhere(page, "#0052c8");
  });

  test("a contrast failure blocks applying until it's fixed or explicitly accepted", async ({
    page,
  }) => {
    await page.goto("/admin/branding");
    await page.getByLabel("Source for primary-fg", { exact: true }).selectOption("custom");
    await page.getByLabel("primary-fg light value").fill("#333333");

    const contrast = page.getByRole("region", { name: "Contrast" });
    await expect(contrast.getByRole("table")).toContainText("1 check fails");
    await expect(contrast).toContainText("primary-fg on primary (text)");
    const apply = page.getByRole("button", { name: "Apply theme" });
    await expect(apply).toBeDisabled();

    const accept = page.getByRole("checkbox", { name: /I accept 1 failing contrast check/ });
    await accept.check();
    await expect(apply).toBeEnabled();
    await accept.uncheck();

    // The suggested shade passes.
    await contrast
      .getByRole("button", { name: /^Use #[0-9a-f]{6} for primary-fg \(light\)$/ })
      .click();
    await expect(contrast.getByRole("status")).toHaveText(/All \d+ checks pass/);
    await expect(apply).toBeEnabled();
  });

  test("broken references are listed and can't be applied", async ({ page }) => {
    await page.goto("/admin/branding");
    await page.getByLabel("Token files (JSON)").setInputFiles({
      name: "broken.tokens.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          a: { $type: "color", $value: "{b}" },
          b: { $type: "color", $value: "{a}" },
        }),
      ),
    });
    const problems = page.getByRole("region", { name: "Problems" });
    await expect(problems.getByRole("alert")).toContainText("Circular reference");
    await expect(page.getByRole("button", { name: "Apply theme" })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: /I accept/ })).toHaveCount(0);
  });

  test("an uploaded font is declared by the applied theme", async ({ page, request }) => {
    await page.goto("/admin/branding");
    const fonts = page.getByRole("region", { name: "Fonts" });
    await fonts.getByLabel("Family").fill("Acme Sans");
    await fonts.getByLabel("Weight").fill("700");
    await fonts.getByLabel("Font file (WOFF2)").setInputFiles({
      name: "acme-bold.woff2",
      mimeType: "font/woff2",
      buffer: Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]),
    });
    await fonts.getByRole("button", { name: "Upload font" }).click();
    await expect(fonts.getByRole("checkbox", { name: /Acme Sans 700 normal/ })).toBeChecked();

    await page.getByLabel("Source for font.sans", { exact: true }).selectOption("custom");
    await page.getByLabel("font.sans value").fill("Acme Sans, sans-serif");
    await page.getByRole("button", { name: "Apply theme" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Applied" })).toBeVisible();

    const css = await (await request.get("/theme.css")).text();
    expect(css).toContain('font-family: "Acme Sans";');
    expect(css).toMatch(/src: url\("\/api\/brand-assets\/ba_[a-z0-9]+"\) format\("woff2"\);/);
    expect(css).toContain('--theme-font-sans: "Acme Sans", sans-serif;');
  });

  test("a file that isn't a PNG or SVG is refused as a logo", async ({ page }) => {
    await page.goto("/admin/branding");
    await page.getByLabel("Upload favicon (PNG or SVG)").setInputFiles({
      name: "favicon.png",
      mimeType: "image/png",
      buffer: Buffer.from("GIF89a not really a png"),
    });
    await expect(page.getByText("Logos and icons must be PNG or SVG files.")).toBeVisible();
  });

  test("viewers can't open the Branding page", async ({ context, page }) => {
    await context.clearCookies();
    await signInAs(context, "bob@example.com");
    await page.goto("/admin/branding");
    await expect(page).toHaveURL(/\/forbidden$/);
    expect((await page.request.get("/api/export/theme")).status()).toBe(403);
  });
});
