import { expect, test, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// The map and org chart fill the screen between the menus and the selected card, and never run
// past its edges (Phase 8). The floor drawing is fitted whole inside the map's box.

type Rect = { left: number; top: number; right: number; bottom: number };

const rect = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el): Rect => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    });

// The map's box: the bordered element around the drawing.
const MAP_BOX = "div:has(> .react-transform-wrapper)";

async function expectWindowDoesNotScroll(page: Page) {
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - window.innerWidth,
    y: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(0);
  expect(overflow.y).toBeLessThanOrEqual(0);
}

async function expectInsideViewport(page: Page, box: Rect) {
  const { width, height } = page.viewportSize()!;
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(width);
  expect(box.bottom).toBeLessThanOrEqual(height);
}

// Every desk and room on the floor lies inside the map's box, so the whole floor is on screen.
async function expectWholeDrawingInside(page: Page, box: Rect) {
  const shapes = await page
    .locator('[data-floor-map] :is([id^="desk-"], [id^="room-"])')
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }),
    );
  expect(shapes.length).toBeGreaterThan(0);
  for (const s of shapes) {
    expect(s.left).toBeGreaterThanOrEqual(box.left);
    expect(s.top).toBeGreaterThanOrEqual(box.top);
    expect(s.right).toBeLessThanOrEqual(box.right);
    expect(s.bottom).toBeLessThanOrEqual(box.bottom);
  }
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test.describe(`full-height views at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ context }) => {
      await resetE2eDatabase();
      await signInAs(context, "jane@example.com");
    });

    test("the map fills the screen below the menus and shows the whole floor", async ({ page }) => {
      await page.goto("/map");
      await expect(page.locator("[data-floor-map] #desk-2-014")).toBeVisible();
      const box = await rect(page, MAP_BOX);
      await expectInsideViewport(page, box);
      // It uses the height that's left: its bottom is near the bottom of the screen.
      expect(viewport.height - box.bottom).toBeLessThan(48);
      await expectWholeDrawingInside(page, box);
      await expectWindowDoesNotScroll(page);
    });

    test("the org chart fills the screen below the menus", async ({ page }) => {
      await page.goto("/org");
      await expect(page.locator("[data-org-chart] svg")).toBeVisible();
      const box = await rect(page, "[data-org-chart]");
      await expectInsideViewport(page, box);
      expect(viewport.height - box.bottom).toBeLessThan(48);
      await expectWindowDoesNotScroll(page);
    });
  });
}

test.describe("full-height views with a card open", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "jane@example.com");
  });

  test("the map stops short of the side column, and the floor still fits", async ({ page }) => {
    await page.goto("/map?person=p_bob");
    const card = page.getByRole("complementary", { name: "Bob Lindqvist details" });
    await expect(card).toBeVisible();
    const box = await rect(page, MAP_BOX);
    const cardBox = (await card.boundingBox())!;
    expect(box.right).toBeLessThanOrEqual(cardBox.x);
    await expectInsideViewport(page, box);
    await expectWholeDrawingInside(page, box);
    await expectWindowDoesNotScroll(page);
  });

  test("the org chart stops short of the person card", async ({ page }) => {
    await page.goto("/org?person=p_bob");
    const card = page.getByRole("complementary", { name: "Bob Lindqvist details" });
    await expect(card).toBeVisible();
    const box = await rect(page, "[data-org-chart]");
    const cardBox = (await card.boundingBox())!;
    expect(box.right).toBeLessThanOrEqual(cardBox.x);
    await expectInsideViewport(page, box);
    await expectWindowDoesNotScroll(page);
  });
});
