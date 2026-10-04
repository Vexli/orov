import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

const FLOOR_2 = readFileSync(
  new URL("../../packages/db/seed-floors/sf-2.svg", import.meta.url),
  "utf8",
);

async function upload(page: Page, name: string, svg: string) {
  await page.getByLabel("Floor drawing (SVG)").setInputFiles({
    name,
    mimeType: "image/svg+xml",
    buffer: Buffer.from(svg),
  });
}

// U11: an admin uploads a new floor drawing and sees what it adds, removes and orphans first.
test.describe("floor drawings (U11)", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
  });

  test("a new drawing shows its diff, needs a confirmation for an occupied desk, and becomes version 2", async ({
    page,
  }) => {
    await page.goto("/admin/locations");
    await page.getByRole("link", { name: "Open Floor 2" }).click();
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 2" })).toBeVisible();

    // Bob's desk is removed and a new desk is added.
    const svg = FLOOR_2.replace(/<rect id="desk-2-014"[^>]*\/>/, "").replace(
      "</svg>",
      '<rect id="desk-2-020" x="1000" y="700" width="90" height="56"/></svg>',
    );
    await upload(page, "floor-2-v2.svg", svg);

    const diff = page.getByRole("region", { name: "Changes from floor-2-v2.svg" });
    await expect(diff.getByRole("heading", { name: "Added (1)" })).toBeVisible();
    await expect(diff).toContainText("SF-2-020");
    await expect(diff.getByRole("heading", { name: "Removed, still assigned (1)" })).toBeVisible();
    await expect(diff).toContainText("SF-2-014: Bob Lindqvist");
    await expect(diff.getByRole("img", { name: "Preview of the drawing" })).toBeVisible();

    const apply = page.getByRole("button", { name: "Apply drawing" });
    await expect(apply).toBeDisabled();
    await page.getByRole("checkbox", { name: /will have no desk/ }).check();
    await apply.click();

    await expect(page.getByRole("status")).toContainText("Saved as version 2");
    const versions = page.getByRole("region", { name: "Versions" });
    await expect(versions.getByRole("row", { name: /^2 current/ })).toBeVisible();

    // Bob is now deskless in the directory.
    await page.goto("/directory?person=p_bob");
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toContainText(
      "No desk assigned",
    );
  });

  test("rolling back shows the diff first and restores the earlier drawing", async ({ page }) => {
    await page.goto("/admin/floors/fl_sf_2");
    await upload(
      page,
      "extra.svg",
      FLOOR_2.replace(
        "</svg>",
        '<rect id="desk-2-030" x="1000" y="700" width="20" height="20"/></svg>',
      ),
    );
    await page.getByRole("button", { name: "Apply drawing" }).click();
    await expect(page.getByRole("status")).toContainText("Saved as version 2");

    await page.getByRole("button", { name: "Roll back to version 1" }).click();
    const diff = page.getByRole("region", { name: "Changes from rolling back to version 1" });
    await expect(
      diff.getByRole("heading", { name: "Removed, will be archived (1)" }),
    ).toBeVisible();
    await expect(diff).toContainText("SF-2-030");

    await page.getByRole("button", { name: "Roll back", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Rolled back to version 1");
    await expect(
      page.getByRole("region", { name: "Versions" }).getByRole("row", { name: /^1 current/ }),
    ).toBeVisible();
  });

  test("a drawing with naming errors can't be applied", async ({ page }) => {
    await page.goto("/admin/floors/fl_sf_2");
    await upload(page, "wrong-floor.svg", FLOOR_2.replace('id="desk-2-001"', 'id="desk-3-001"'));
    await expect(page.getByRole("alert").filter({ hasText: 'numbered for floor "3"' })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply drawing" })).toBeDisabled();
  });

  test("a file that isn't SVG is rejected before any diff", async ({ page }) => {
    await page.goto("/admin/floors/fl_sf_2");
    await upload(page, "notes.svg", "just some text");
    await expect(page.getByRole("alert").filter({ hasText: "isn't an SVG" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply drawing" })).toHaveCount(0);
  });

  test("an admin creates an office and a floor", async ({ page }) => {
    await page.goto("/admin/locations");
    await page.getByRole("link", { name: "New office" }).click();
    await page.getByLabel("Name").fill("New York");
    await page.getByLabel("Slug").fill("nyc");
    await page.getByLabel("Time zone").fill("America/New_York");
    await page.getByLabel("Region").fill("us-ny");
    await page.getByRole("button", { name: "Create office" }).click();

    const office = page.getByRole("region", { name: "New York" });
    await expect(office).toContainText("US-NY");
    await office.getByRole("link", { name: "Add floor" }).click();
    await page.getByLabel("Name").fill("Floor 7");
    await page.getByLabel("Slug").fill("7");
    await page.getByLabel("Level").fill("7");
    await page.getByRole("button", { name: "Create floor" }).click();
    await expect(page.getByRole("region", { name: "New York" })).toContainText("Floor 7");
  });

  test("viewers can't reach the floor admin", async ({ page, context }) => {
    await context.clearCookies();
    await signInAs(context, "bob@example.com");
    await page.goto("/admin/floors/fl_sf_2");
    await expect(page).toHaveURL(/\/forbidden/);
  });
});

test.describe("an office's own name for its floors (#16)", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
  });

  test("calling them buildings changes the admin pages and the map", async ({ page }) => {
    await page.goto("/admin/locations/loc_sf");
    await page.getByLabel("Preset").selectOption({ label: "Building" });
    await expect(page.getByLabel("One", { exact: true })).toHaveValue("Building");
    await expect(page.getByLabel("More than one")).toHaveValue("Buildings");
    await page.getByRole("button", { name: "Save office" }).click();
    await expect(page).toHaveURL(/\/admin\/locations$/);
    await expect(page.getByRole("link", { name: "Add building" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Building" })).toBeVisible();

    await page.goto("/map?loc=sf&floor=2");
    await expect(page.getByRole("region", { name: "Building map" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Buildings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Whole building" })).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "San Francisco overview" }).getByRole("columnheader", { name: "Building" }),
    ).toBeVisible();
  });

  test("a new office calls them floors unless told otherwise", async ({ page }) => {
    await page.goto("/admin/locations/new");
    await expect(page.getByLabel("Preset")).toHaveValue("0");
    await expect(page.getByLabel("One", { exact: true })).toHaveValue("Floor");
    await page.getByLabel("One", { exact: true }).fill("Campus");
    await expect(page.getByLabel("Preset")).toHaveValue("-1");
  });
});
