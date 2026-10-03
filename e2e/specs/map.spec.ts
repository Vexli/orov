import { expect, test, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// The default theme's map selection color, --map-selection, as the browser reports it.
const SELECTION = "rgb(245, 158, 11)";

const fillOf = (page: Page, id: string) =>
  page.locator(`[data-floor-map] #${id}`).evaluate((el) => getComputedStyle(el).fill);

test.describe("floor map", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("opens the first floor with its drawing and an avatar at each occupied desk", async ({
    page,
  }) => {
    await page.goto("/map");
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 2" })).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Floor plan of San Francisco, Floor 2" }),
    ).toBeVisible();
    await expect(page.locator("[data-floor-map] #desk-2-014")).toBeVisible();

    // Jane, Max and Bob sit on Floor 2. Sam is on Floor 3.
    await expect(page.locator("[data-avatar]")).toHaveCount(3);
    await expect(page.locator('[data-avatar="desk-2-014"]')).toContainText("BL");
    await expect(page.locator('[data-avatar="desk-2-014"] title')).toHaveText("Bob Lindqvist");
  });

  test("clicking an occupied desk selects that person and colors the desk from the theme", async ({
    page,
  }) => {
    await page.goto("/map");
    await page.locator("[data-floor-map] #desk-2-014").click();
    await expect(page).toHaveURL(/person=p_bob/);
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toBeVisible();
    expect(await fillOf(page, "desk-2-014")).toBe(SELECTION);
    expect(await fillOf(page, "desk-2-010")).not.toBe(SELECTION);
  });

  test("clicking a room shows the room", async ({ page }) => {
    await page.goto("/map");
    await page.locator("[data-floor-map] #room-boardroom").click();
    const card = page.getByRole("complementary", { name: "Boardroom details" });
    await expect(card).toContainText("Meeting room");
    await expect(card).toContainText("12");
    expect(await fillOf(page, "room-boardroom")).toBe(SELECTION);
  });

  test("a change of selection restyles the drawing without replacing it", async ({ page }) => {
    await page.goto("/map");
    const drawing = page.locator("[data-floor-map] svg").first();
    await drawing.evaluate((el) => el.setAttribute("data-marker", "original"));

    await page.locator("[data-floor-map] #desk-2-014").click();
    await page.locator("[data-floor-map] #room-boardroom").click();
    await expect(page).toHaveURL(/space=/);
    await expect(page.locator('[data-floor-map] svg[data-marker="original"]')).toHaveCount(1);
  });

  test("a selected person from a shared link is highlighted on load", async ({ page }) => {
    await page.goto("/map?person=p_jane");
    await expect(page.getByRole("complementary", { name: "Jane Park details" })).toBeVisible();
    await expect.poll(() => fillOf(page, "desk-2-003")).toBe(SELECTION);
  });

  test("the zoom buttons zoom the map", async ({ page }) => {
    await page.goto("/map");
    const content = page.locator(".react-transform-component");
    const before = await content.evaluate((el) => getComputedStyle(el).transform);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect
      .poll(() => content.evaluate((el) => getComputedStyle(el).transform))
      .not.toBe(before);
  });

  test("the Map tab is in the shell and marked current", async ({ page }) => {
    await page.goto("/directory");
    await page
      .getByRole("navigation", { name: "Views" })
      .getByRole("link", { name: "Map" })
      .click();
    await expect(page).toHaveURL(/\/map/);
    await expect(page.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  });
});
