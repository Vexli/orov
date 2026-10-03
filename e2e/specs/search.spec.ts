import { expect, test, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Views" }).getByRole("link", { name });

// The dialog's results, which the page's own <select> options can't be confused with.
const results = (page: Page) => page.getByRole("dialog", { name: "Search" }).getByRole("option");

async function searchFor(page: Page, text: string) {
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByRole("combobox", { name: "Search people, teams and rooms" });
  await expect(input).toBeFocused();
  await input.fill(text);
}

test.describe("view tabs and search", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("the tabs carry the selected person and team, and leave view-only params behind", async ({
    page,
  }) => {
    await page.goto("/map?person=p_bob&team=t_hr&sub=true&view=list");
    await expect(tab(page, "Org chart")).toHaveAttribute(
      "href",
      "/org?person=p_bob&team=t_hr&sub=true",
    );
    await expect(tab(page, "Directory")).toHaveAttribute(
      "href",
      "/directory?person=p_bob&team=t_hr&sub=true",
    );

    // A selection made in the page updates the tabs without a reload.
    await page.getByRole("button", { name: "SF-2-003" }).click();
    await expect(tab(page, "Org chart")).toHaveAttribute(
      "href",
      "/org?person=p_jane&team=t_hr&sub=true",
    );
  });

  test("⌘K finds a person, and choosing them selects them in the current view", async ({
    page,
  }) => {
    await page.goto("/directory");
    await searchFor(page, "lindq");
    const option = results(page).filter({ hasText: "Bob Lindqvist" });
    await expect(option).toContainText("Payroll Analyst · SF-2-014");
    await expect(option).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/directory\?person=p_bob/);
    await expect(page.getByRole("dialog", { name: "Search" })).toBeHidden();
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toBeVisible();
  });

  test("a team keeps the view's own params, such as the org chart's tree", async ({ page }) => {
    await page.goto("/org?tree=team");
    await searchFor(page, "payrol");
    await results(page).filter({ hasText: "Team in HR" }).click();
    await expect(page).toHaveURL(/tree=team/);
    await expect(page).toHaveURL(/team=t_payroll/);
    await expect(page.getByRole("status", { name: "Highlighted team" })).toHaveText(
      "Payroll: 1 person",
    );
  });

  test("a room opens on its floor in the map", async ({ page }) => {
    await page.goto("/directory?person=p_bob");
    await searchFor(page, "worksh");
    await results(page).filter({ hasText: "Workshop" }).click();
    await expect(page).toHaveURL(/\/map\?loc=sf&floor=3&space=sp_workshop/);
    await expect(page.getByRole("heading", { name: "San Francisco, Floor 3" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Workshop details" })).toBeVisible();
  });

  test("arrow keys move through the results, grouped by kind", async ({ page }) => {
    await page.goto("/directory");
    await searchFor(page, "recruit");
    const listbox = page
      .getByRole("dialog", { name: "Search" })
      .getByRole("listbox", { name: "Results" });
    await expect(listbox.getByRole("group", { name: "People" }).getByRole("option")).toHaveCount(2);
    await expect(listbox.getByRole("group", { name: "Teams" }).getByRole("option")).toHaveText([
      /Recruiting/,
    ]);
    const options = listbox.getByRole("option");
    await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(options.nth(2)).toHaveAttribute("aria-selected", "true");
  });

  test("the Search button opens it, Escape closes it, and nothing matching says so", async ({
    page,
  }) => {
    await page.goto("/map");
    await page.getByRole("button", { name: "Search" }).click();
    const dialog = page.getByRole("dialog", { name: "Search" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").fill("zzzzqq");
    await expect(dialog.getByRole("status")).toHaveText("No matches.");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
