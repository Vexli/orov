import { expect, test } from "@playwright/test";
import { resetE2eDatabase, withE2eDb } from "../support/database";
import { signInAs } from "../support/session";

// #26: room, point of interest and area names on the map come from the database, drawn by the
// app over the drawing. The seed drawings have no text of their own.
test.describe("map labels", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  const label = (page: import("@playwright/test").Page, svgId: string) =>
    page.locator(`[data-floor-map] [data-label="${svgId}"]`);

  test("rooms, points of interest and areas are labelled with their names", async ({ page }) => {
    await page.goto("/map?loc=sf&floor=2");
    await expect(label(page, "room-boardroom")).toHaveText("Boardroom");
    await expect(label(page, "poi-kitchen")).toHaveText("Kitchen");
    await expect(label(page, "poi-restroom")).toHaveText("Restroom");
    await expect(label(page, "area-south-wing")).toHaveText("South Wing");
    // The drawing itself carries no names any more, so nothing is written twice.
    // (The drawing is the div; the overlay is an svg beside it.)
    await expect(page.locator("[data-floor-map] > div text")).toHaveCount(0);
  });

  test("a renamed room shows its new name without a new drawing", async ({ page }) => {
    await withE2eDb((db) => db.$client.query("UPDATE space SET name = 'Fjord' WHERE id = 'sp_boardroom'"));
    await page.goto("/map?loc=sf&floor=2");
    await expect(label(page, "room-boardroom")).toHaveText("Fjord");
  });

  test("labels outside an open area are dimmed with the rest of the drawing", async ({ page }) => {
    await page.goto("/map?loc=sf&floor=2&area=south-wing");
    await expect(label(page, "area-north-wing")).toHaveAttribute("style", /opacity/);
    await expect(label(page, "area-south-wing")).not.toHaveAttribute("style", /opacity/);
  });
});
