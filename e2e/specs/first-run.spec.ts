import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { appUser } from "@orov/db/schema";
import { emptyE2eDatabase, withE2eDb } from "../support/database";
import { signInAs } from "../support/session";

// A new install starts empty (Phase 8). The first admin is told how to set it up, and can load the
// demo organization from the repository through Admin → Backup.

const DEMO_FILE = fileURLToPath(new URL("../../demo/orov-demo.json", import.meta.url));

test.describe("a new, empty instance", () => {
  test.beforeEach(async () => {
    await emptyE2eDatabase();
    // As the first sign-in of an ADMIN_EMAILS address and of anyone else would leave them.
    await withE2eDb((db) =>
      db.insert(appUser).values([
        { email: "admin@example.com", role: "admin" },
        { email: "viewer@example.com", role: "viewer" },
      ]),
    );
  });

  test("an admin is shown how to set it up, in every view", async ({ page, context }) => {
    await signInAs(context, "admin@example.com");
    for (const path of ["/directory", "/map", "/org"]) {
      await page.goto(path);
      const start = page.getByRole("region", { name: /Directory|Map|Org chart/ });
      await expect(start).toContainText("This instance is empty.");
      await expect(start.getByRole("link", { name: "Add your offices" })).toHaveAttribute(
        "href",
        "/admin/locations",
      );
      await expect(
        start.getByRole("link", { name: "Import your teams and people" }),
      ).toHaveAttribute("href", "/admin/import");
      await expect(start.getByRole("link", { name: "Admin → Backup" })).toHaveAttribute(
        "href",
        "/admin/backup",
      );
    }
  });

  test("anyone else is told it isn't set up yet", async ({ page, context }) => {
    await signInAs(context, "viewer@example.com");
    await page.goto("/directory");
    await expect(page.getByText("No one has been added yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add your offices" })).toHaveCount(0);
  });

  test("the demo organization loads through Admin → Backup → Replace", async ({
    page,
    context,
  }) => {
    await signInAs(context, "admin@example.com");
    await page.goto("/admin/backup");
    const importSection = page.getByRole("region", { name: "Import" });
    await importSection.getByLabel("Export file").setInputFiles(DEMO_FILE);
    await importSection.getByLabel("Its passphrase").fill("orov-demo-data");
    await importSection.getByRole("radio", { name: /^Replace/ }).check();
    await importSection.getByRole("button", { name: "Preview" }).click();
    await expect(
      importSection.getByRole("table", { name: "What the import would change" }),
    ).toBeVisible();
    await importSection.getByRole("button", { name: "Replace and import" }).click();
    await expect(importSection.getByRole("status")).toContainText("Imported.", { timeout: 30_000 });

    // The importing admin is still an admin, and the demo's offices, people and theme are in.
    await page.goto("/directory");
    await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
    expect(await page.getByRole("row").count()).toBeGreaterThan(100);
    await expect(page).toHaveTitle(/OrOv Demo/);
    await page.goto("/map");
    await expect(page.getByRole("button", { name: "Floor 4" })).toBeVisible();
    await expect(page.locator("[data-floor-map] #desk-4-001")).toBeVisible();
  });
});
