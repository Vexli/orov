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

test.describe("renaming rooms (#21)", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
  });

  test("a renamed room shows its new name on the map, its card, the list and in search", async ({ page }) => {
    await page.goto("/admin/floors/fl_sf_2");
    const names = page.getByRole("region", { name: "Room and area names" });
    await page.getByLabel("Name of room-huddle-a").fill("Fjord");
    await page.getByLabel("Seats in Huddle A").fill("6");
    await page.getByLabel("Name of room-huddle-a").press("Enter");
    await expect(page.getByLabel("Name of room-huddle-a")).toHaveValue("Fjord");
    await expect(names.getByRole("button", { name: "Saved" })).toBeVisible();

    await page.goto("/map?loc=sf&floor=2");
    await expect(page.locator('[data-floor-map] [data-label="room-huddle-a"]')).toHaveText("Fjord");
    await page.locator("[data-floor-map] #room-huddle-a").click();
    await expect(page.getByRole("complementary", { name: /Fjord/ })).toBeVisible();

    await page.goto("/map?loc=sf&floor=2&view=list");
    await expect(page.getByRole("button", { name: /Fjord/ })).toBeVisible();

    const results = await (await page.request.get("/api/search?q=fjord")).json();
    expect(results.rooms.map((r: { name: string }) => r.name)).toEqual(["Fjord"]);
  });

  test("a name can't be blank", async ({ page }) => {
    await page.goto("/admin/floors/fl_sf_2");
    await page.getByLabel("Name of room-boardroom").fill(" ");
    await page.getByLabel("Name of room-boardroom").press("Enter");
    await expect(page.getByText("Name is required")).toBeVisible();
  });
});

test.describe("editing a drawing in the browser (#21)", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
  });

  // A point in drawing units (SF Floor 2 is 1200 × 800) as a position on the editor.
  // The mouse doesn't scroll, so the drawing is brought to the top of the viewport first.
  async function at(page: Page, x: number, y: number) {
    const drawing = page.locator("[data-drawing-editor] svg");
    await drawing.evaluate((el) => el.scrollIntoView({ block: "start" }));
    const box = (await drawing.boundingBox())!;
    return { x: box.x + (x / 1200) * box.width, y: box.y + (y / 800) * box.height };
  }

  test("an admin places a desk and draws a room, and they arrive as a new version", async ({ page }) => {
    await page.goto("/admin/floors/fl_sf_2");
    const editor = page.getByRole("region", { name: "Edit the drawing here" });

    // An empty spot at the bottom of the North Wing.
    const desk = await at(page, 450, 400);
    await page.mouse.click(desk.x, desk.y);
    await expect(page.getByRole("status")).toContainText("Added desk-2-017");

    await editor.getByLabel("Draw a room").check();
    await editor.getByLabel("Room name").fill("Fjord");
    const from = await at(page, 300, 690);
    const to = await at(page, 400, 760);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
    await expect(page.getByRole("status")).toContainText("Added room-fjord");

    const changes = page.getByRole("region", { name: "Changes from your edits" });
    await expect(changes).toContainText("Added (2)");
    await expect(changes).toContainText("SF-2-017");
    await expect(changes).toContainText("Fjord");
    await page.getByRole("button", { name: "Apply drawing" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved as version 2.");

    await page.goto("/admin/people/p_priya");
    await expect(page.getByLabel("Desk").locator("option", { hasText: "SF-2-017" })).toHaveCount(1);
    await page.goto("/map?loc=sf&floor=2");
    await expect(page.locator('[data-floor-map] [data-label="room-fjord"]')).toHaveText("Fjord");
  });

  test("removing an occupied desk asks first, as an upload would", async ({ page }) => {
    await page.goto("/admin/floors/fl_sf_2");
    const editor = page.getByRole("region", { name: "Edit the drawing here" });
    await editor.getByLabel("Remove").check();
    await editor.locator("#desk-2-014").click();
    await expect(page.getByRole("status")).toContainText("Removed desk-2-014");
    await expect(page.getByRole("button", { name: "Apply drawing" })).toBeDisabled();
    await page.getByRole("checkbox", { name: /will have no desk/ }).check();
    await page.getByRole("button", { name: "Apply drawing" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved as version 2.");
  });
});

test.describe("archiving and deleting (#22)", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
  });

  test("archiving a floor names who loses a desk, hides it, and unarchiving brings it back", async ({ page }) => {
    await page.goto("/admin/floors/fl_sf_3");
    const section = page.getByRole("region", { name: "Archive or delete" });
    await expect(section.getByRole("button", { name: "Delete floor" })).toHaveCount(0);
    await section.getByRole("button", { name: "Archive floor" }).click();
    await expect(section.getByRole("alert")).toContainText("Sam Ortiz has a desk here");
    await section.getByRole("button", { name: "Archive and leave them without a desk" }).click();
    await expect(section).toContainText("is archived");

    await page.goto("/map?loc=sf");
    await expect(page.getByRole("group", { name: "Floors" }).getByRole("button")).toHaveText(["Floor 2"]);
    await page.goto("/admin/locations");
    await expect(page.getByRole("link", { name: "Open Floor 3" })).toHaveCount(0);
    await page.getByRole("link", { name: "Show archived" }).click();
    await expect(page.getByRole("link", { name: "Open Floor 3" })).toBeVisible();

    await page.goto("/admin/floors/fl_sf_3");
    await section.getByRole("button", { name: "Unarchive floor" }).click();
    await expect(section.getByRole("button", { name: "Archive floor" })).toBeVisible();
    await page.goto("/map?loc=sf");
    await expect(page.getByRole("group", { name: "Floors" }).getByRole("button")).toHaveText(["Floor 2", "Floor 3"]);
  });

  test("an office that never had a drawing can be deleted", async ({ page }) => {
    await page.goto("/admin/locations/new");
    await page.getByLabel("Name").fill("Lisbon");
    await page.getByLabel("Slug").fill("lis");
    await page.getByLabel("Time zone").fill("Europe/Lisbon");
    await page.getByLabel("Region").fill("PT");
    await page.getByRole("button", { name: "Create office" }).click();
    await expect(page).toHaveURL(/\/admin\/locations$/);
    await page.getByRole("region", { name: "Lisbon" }).getByRole("link", { name: "Edit office" }).click();
    await page.getByRole("region", { name: "Archive or delete" }).getByRole("button", { name: "Delete office" }).click();
    await expect(page).toHaveURL(/\/admin\/locations$/);
    await expect(page.getByRole("region", { name: "Lisbon" })).toHaveCount(0);
  });
});
