import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// Phone-width layout (Phase 6): a one-row main menu, the selected card as a sheet along the
// bottom of the screen, and a full-screen map.
test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
  });

  test("the main menu is one row, with the account links in a menu", async ({ page }) => {
    await page.goto("/directory");
    const header = page.locator("header");
    const views = header.getByRole("navigation", { name: "Views" });
    const menu = header.locator("summary", { hasText: "Menu" });
    // Same row: the menu button's top is level with the view tabs.
    const [tabsBox, menuBox] = [await views.boundingBox(), await menu.boundingBox()];
    expect(Math.abs(tabsBox!.y + tabsBox!.height / 2 - (menuBox!.y + menuBox!.height / 2))).toBeLessThan(8);

    await expect(page.getByRole("link", { name: "Settings" })).toBeHidden();
    await menu.click();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("choosing someone in the directory shows their card on screen, at the bottom", async ({ page }) => {
    await page.goto("/directory");
    await page.getByRole("row", { name: /Bob Lindqvist/ }).click();
    const card = page.getByRole("complementary", { name: "Bob Lindqvist details" });
    await expect(card).toBeInViewport();
    const box = (await card.boundingBox())!;
    expect(box.y).toBeGreaterThan(844 / 2);

    // The last row can still be scrolled clear of the sheet.
    const last = page.getByRole("row", { name: /Priya Raman/ });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect((await last.boundingBox())!.y + 40).toBeLessThan(box.y);
  });

  test("the map opens full screen, keeps the card on top, and Escape leaves it", async ({ page }) => {
    await page.goto("/map");
    const fullScreen = page.getByRole("button", { name: "Full screen" });
    await fullScreen.click();
    await expect(fullScreen).toHaveAttribute("aria-pressed", "true");
    const map = page.locator("[data-full-screen]");
    expect(await map.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });

    await page.locator("[data-floor-map] #desk-2-014").click();
    const card = page.getByRole("complementary", { name: "Bob Lindqvist details" });
    await expect(card).toBeInViewport();
    await expect(page.locator("[data-floor-map] #desk-2-014")).toBeInViewport();

    await page.keyboard.press("Escape");
    await expect(map).toHaveCount(0);
    await expect(fullScreen).toHaveAttribute("aria-pressed", "false");
  });
});
