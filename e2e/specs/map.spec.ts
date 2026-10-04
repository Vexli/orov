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

const scaleOf = (page: Page) =>
  page
    .locator(".react-transform-component")
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).a);

test.describe("floor and area navigation", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("U6: the South Wing opens zoomed in, with the rest of the floor dimmed", async ({ page }) => {
    await page.goto("/map?loc=sf&floor=2&area=south-wing");
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 2, South Wing" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Areas" }).getByRole("button", { name: "South Wing" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await expect.poll(() => scaleOf(page)).toBeGreaterThan(1.2);
    const opacity = (id: string) =>
      page.locator(`[data-floor-map] #${id}`).evaluate((el) => getComputedStyle(el).opacity);
    await expect.poll(() => opacity("area-north-wing")).toBe("0.25");
    await expect.poll(() => opacity("room-boardroom")).toBe("0.25");
    expect(await opacity("area-south-wing")).toBe("1");
    // Avatars follow: Max sits in the North Wing, Jane in the South Wing.
    await expect(page.locator('[data-avatar="desk-2-010"]')).toHaveCSS("opacity", "0.25");
    await expect(page.locator('[data-avatar="desk-2-003"]')).toHaveCSS("opacity", "1");

    await page.getByRole("button", { name: "Whole floor" }).click();
    await expect(page).not.toHaveURL(/area=/);
    await expect.poll(() => opacity("area-north-wing")).toBe("1");
    await expect.poll(() => scaleOf(page)).toBe(1);
  });

  test("the floor buttons load another floor's drawing and seats", async ({ page }) => {
    await page.goto("/map");
    await page.getByRole("group", { name: "Floors" }).getByRole("button", { name: "Floor 3" }).click();
    await expect(page).toHaveURL(/floor=3/);
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 3" })).toBeVisible();
    await expect(page.locator("[data-floor-map] #desk-3-001")).toBeVisible();
    await expect(page.locator('[data-avatar="desk-3-001"]')).toContainText("SO");
    await expect(page.locator("[data-avatar]")).toHaveCount(1);
  });

  test("the office overview counts each floor and links to it", async ({ page }) => {
    await page.goto("/map");
    const overview = page.getByRole("complementary", { name: "San Francisco overview" });
    await expect(overview.getByRole("row", { name: /Floor 2/ })).toContainText(/3\s*13\s*3/);
    await expect(overview.getByRole("row", { name: /Floor 3/ })).toContainText(/1\s*8\s*2/);
    await overview.getByRole("button", { name: "Floor 3" }).click();
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 3" })).toBeVisible();
  });

  test("switching floors drops an area that belonged to the old floor", async ({ page }) => {
    await page.goto("/map?loc=sf&floor=2&area=south-wing");
    await page.getByRole("group", { name: "Floors" }).getByRole("button", { name: "Floor 3" }).click();
    await expect(page).toHaveURL(/floor=3/);
    await expect(page).not.toHaveURL(/area=/);
  });
});

// The default theme's --map-highlight.
const HIGHLIGHT = "rgb(2, 132, 199)";

test.describe("person focus and team highlight", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("U1: find Bob in the directory and see his seat highlighted on the right floor", async ({ page }) => {
    await page.goto("/directory");
    await page.getByRole("searchbox", { name: "Search people" }).fill("bob");
    await page.getByRole("button", { name: /Bob Lindqvist/ }).click();
    // The card's desk link. The list row has one too, since #15.
    await page
      .getByRole("complementary", { name: "Bob Lindqvist details" })
      .getByRole("link", { name: "Show SF-2-014 on the map" })
      .click();

    await expect(page).toHaveURL(/\/map\?.*person=p_bob/);
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 2" })).toBeVisible();
    // The URL gains the floor, so the link can be shared.
    await expect(page).toHaveURL(/loc=sf/);
    await expect(page).toHaveURL(/floor=2/);
    await expect.poll(() => fillOf(page, "desk-2-014")).toBe(SELECTION);
  });

  test("a link to someone on another floor opens their floor", async ({ page }) => {
    await page.goto("/map?loc=sf&floor=2&person=p_sam");
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 3" })).toBeVisible();
    await expect(page).toHaveURL(/floor=3/);
    await expect.poll(() => fillOf(page, "desk-3-001")).toBe(SELECTION);
  });

  test("following a manager to another floor moves the map there", async ({ page }) => {
    await page.goto("/map?person=p_sam");
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 3" })).toBeVisible();
    await page
      .getByRole("complementary", { name: "Sam Ortiz details" })
      .getByRole("button", { name: "Max Osei" })
      .click();
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 2" })).toBeVisible();
    await expect(page).toHaveURL(/person=p_max/);
    await expect.poll(() => fillOf(page, "desk-2-010")).toBe(SELECTION);
  });

  test("an open area moves to the focused person's area", async ({ page }) => {
    await page.goto("/map?loc=sf&floor=2&area=north-wing&person=p_jane");
    await expect(page).toHaveURL(/area=south-wing/);
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 2, South Wing" })).toBeVisible();
  });

  test("choosing another floor by hand ends the person focus", async ({ page }) => {
    await page.goto("/map?person=p_bob");
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toBeVisible();
    await page.getByRole("group", { name: "Floors" }).getByRole("button", { name: "Floor 3" }).click();
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 3" })).toBeVisible();
    await expect(page).not.toHaveURL(/person=/);
  });

  test("someone without a desk gets a card, not a seat", async ({ page }) => {
    await page.goto("/map?person=p_priya");
    await expect(page.getByRole("note")).toContainText("Priya Raman has no desk");
    await expect(page.getByRole("complementary", { name: "Priya Raman details" })).toContainText(
      "Karnātaka, India Remote",
    );
  });

  test("U2: HR with its sub-teams highlights every member's seat, with a count per floor", async ({ page }) => {
    await page.goto("/map");
    await page.getByRole("combobox", { name: "Highlight team" }).selectOption({ label: "HR" });
    const status = page.getByRole("status", { name: "Team seats" });
    await page.getByRole("checkbox", { name: "Include sub-teams" }).uncheck();
    await expect(page).toHaveURL(/sub=false/);
    await expect(status).toContainText("HR: 3 seats");
    await expect(status).toContainText("Floor 2: 3");

    // Sub-teams are the default, so ticking the box again drops the param.
    await page.getByRole("checkbox", { name: "Include sub-teams" }).check();
    await expect(page).toHaveURL(/team=t_hr/);
    await expect(page).not.toHaveURL(/sub=/);
    await expect(status).toContainText("HR and sub-teams: 4 seats");
    await expect(status).toContainText("Floor 3: 1");
    await expect(status).toContainText("1 without a desk");

    for (const id of ["desk-2-003", "desk-2-010", "desk-2-014"]) {
      await expect.poll(() => fillOf(page, id)).toBe(HIGHLIGHT);
    }
    expect(await fillOf(page, "desk-2-016")).not.toBe(HIGHLIGHT);

    await status.getByRole("button", { name: "Floor 3: 1" }).click();
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 3" })).toBeVisible();
    await expect.poll(() => fillOf(page, "desk-3-001")).toBe(HIGHLIGHT);
    // The team carries over to the new floor.
    await expect(page).toHaveURL(/team=t_hr/);
  });
});

test.describe("list view", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("the List toggle shows the floor's desks and rooms as a table, and remembers it", async ({ page }) => {
    await page.goto("/map");
    await page.getByRole("group", { name: "Display" }).getByRole("button", { name: "List" }).click();
    await expect(page).toHaveURL(/view=list/);

    const table = page.getByRole("table", { name: "Desks and rooms on San Francisco, Floor 2" });
    // 13 desks and 3 rooms. Kitchens, elevators and restrooms aren't listed.
    await expect(table.locator("tbody tr")).toHaveCount(16);
    await expect(table.getByRole("row", { name: /SF-2-014/ })).toContainText("Bob Lindqvist");
    await expect(table.getByRole("row", { name: /SF-2-016/ })).toContainText("Free");
    await expect(table.getByRole("row", { name: /Boardroom/ })).toContainText("Meeting room · 12 seats");
    await expect(table).not.toContainText("Kitchen");

    await page.reload();
    await expect(table).toBeVisible();
  });

  test("a keyboard user selects a person from the list, with the same result as a map click", async ({ page }) => {
    await page.goto("/map?view=list");
    const desk = page.getByRole("button", { name: "SF-2-014" });
    await desk.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/person=p_bob/);
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toBeVisible();
    await expect(page.getByRole("row", { name: /SF-2-014/ })).toHaveAttribute("aria-current", "true");

    // Back on the map, the same desk is selected.
    await page.getByRole("group", { name: "Display" }).getByRole("button", { name: "Map" }).click();
    await expect(page).not.toHaveURL(/view=/);
    await expect.poll(() => fillOf(page, "desk-2-014")).toBe(SELECTION);
  });

  test("the list follows the open area and the highlighted team", async ({ page }) => {
    await page.goto("/map?view=list&area=south-wing&team=t_hr");
    const rows = page.getByRole("table", { name: /Desks and rooms/ }).locator("tbody tr");
    // Six South Wing desks and Huddle A.
    await expect(rows).toHaveCount(7);
    await expect(page.getByRole("row", { name: /SF-2-003/ })).toContainText("Jane Park In team");
  });
});
