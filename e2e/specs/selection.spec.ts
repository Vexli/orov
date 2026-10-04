import { expect, test, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// U9: the selected person or team survives a switch between the directory, map and org chart.

// The default theme's --map-selection, as the browser reports it.
const SELECTION = "rgb(245, 158, 11)";

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Views" }).getByRole("link", { name });

const deskFill = (page: Page, id: string) =>
  page.locator(`[data-floor-map] #${id}`).evaluate((el) => getComputedStyle(el).fill);

const orgNode = (page: Page, id: string) =>
  page.locator(`[data-org-chart] [data-org-node="${id}"]`);

interface Person {
  id: string;
  name: string;
  desk: string;
  manager: string | null;
}

const bob: Person = { id: "p_bob", name: "Bob Lindqvist", desk: "desk-2-014", manager: "Max Osei" };
const jane: Person = { id: "p_jane", name: "Jane Park", desk: "desk-2-003", manager: null };

// Each view, checked for the same person: the card, plus that view's own sign of focus.
async function expectDirectoryFocus(page: Page, p: Person) {
  await expect(page).toHaveURL(new RegExp(`/directory\\?person=${p.id}`));
  await expect(page.locator(`#person-row-${p.id}`)).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("complementary", { name: `${p.name} details` })).toBeVisible();
}

async function expectMapFocus(page: Page, p: Person) {
  await expect(page).toHaveURL(new RegExp(`/map\\?.*person=${p.id}`));
  await expect.poll(() => deskFill(page, p.desk)).toBe(SELECTION);
  await expect(page.getByRole("complementary", { name: `${p.name} details` })).toBeVisible();
}

async function expectOrgFocus(page: Page, p: Person) {
  await expect(page).toHaveURL(new RegExp(`/org\\?person=${p.id}`));
  await expect(orgNode(page, p.id)).toHaveAttribute("data-selected", "");
  await expect(page.getByRole("complementary", { name: `${p.name} details` })).toBeVisible();
  const line = page.getByRole("region", { name: "Reporting line" });
  if (p.manager) await expect(line).toContainText(p.manager);
  else await expect(line).toContainText("doesn't report to anyone");
}

test.describe("U9: selection across views", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("Bob selected in the directory stays selected on the map and the org chart", async ({
    page,
  }) => {
    await page.goto("/directory");
    await page.getByRole("button", { name: /Bob Lindqvist/ }).click();
    await expectDirectoryFocus(page, bob);

    await tab(page, "Map").click();
    await expectMapFocus(page, bob);
    await tab(page, "Org chart").click();
    await expectOrgFocus(page, bob);
    await tab(page, "Directory").click();
    await expectDirectoryFocus(page, bob);
  });

  test("Bob selected on the map stays selected in the org chart and the directory", async ({
    page,
  }) => {
    await page.goto("/map");
    await page.locator(`[data-floor-map] #${bob.desk}`).click();
    await expectMapFocus(page, bob);

    await tab(page, "Org chart").click();
    await expectOrgFocus(page, bob);
    await tab(page, "Directory").click();
    await expectDirectoryFocus(page, bob);
    await tab(page, "Map").click();
    await expectMapFocus(page, bob);
  });

  test("Bob selected in the org chart stays selected in the directory and on the map", async ({
    page,
  }) => {
    await page.goto("/org");
    await orgNode(page, bob.id).click();
    await expectOrgFocus(page, bob);

    await tab(page, "Directory").click();
    await expectDirectoryFocus(page, bob);
    await tab(page, "Map").click();
    await expectMapFocus(page, bob);
    await tab(page, "Org chart").click();
    await expectOrgFocus(page, bob);
  });

  test("a new selection in one view is the one the next view shows", async ({ page }) => {
    await page.goto("/org?person=p_bob");
    await expectOrgFocus(page, bob);
    // Up the reporting line to Jane, then over to the map: Jane's desk, not Bob's.
    await page
      .getByRole("region", { name: "Reporting line" })
      .getByRole("button", { name: "Jane Park" })
      .click();
    await expectOrgFocus(page, jane);

    await tab(page, "Map").click();
    await expectMapFocus(page, jane);
    expect(await deskFill(page, bob.desk)).not.toBe(SELECTION);
  });

  test("a team and its sub-teams stay highlighted in every view", async ({ page }) => {
    await page.goto("/directory");
    await page.getByRole("combobox", { name: "Filter by team" }).selectOption({ label: "HR" });
    await expect(page.getByText("Showing 5 of 5")).toBeVisible();

    await tab(page, "Map").click();
    await expect(page).toHaveURL(/\/map\?team=t_hr$/);
    await expect(page.getByRole("status", { name: "Team seats" })).toContainText(
      "HR and sub-teams: 4 seats",
    );

    await tab(page, "Org chart").click();
    await expect(page).toHaveURL(/\/org\?team=t_hr$/);
    await expect(page.getByRole("status", { name: "Highlighted team" })).toHaveText(
      "HR and sub-teams: 5 people",
    );
    await expect(page.locator("[data-org-chart] [data-highlighted]")).toHaveCount(5);

    await tab(page, "Directory").click();
    await expect(page.getByRole("combobox", { name: "Filter by team" })).toHaveValue("t_hr");
    await expect(page.getByRole("checkbox", { name: "Include sub-teams" })).toBeChecked();
  });

  test("turning sub-teams off carries across the views", async ({ page }) => {
    await page.goto("/directory?team=t_hr");
    await page.getByRole("checkbox", { name: "Include sub-teams" }).uncheck();
    await expect(page.getByText("Showing 3 of 5")).toBeVisible();

    await tab(page, "Map").click();
    await expect(page).toHaveURL(/\/map\?team=t_hr&sub=false/);
    await expect(page.getByRole("status", { name: "Team seats" })).toContainText("HR: 3 seats");

    await tab(page, "Org chart").click();
    await expect(page.getByRole("status", { name: "Highlighted team" })).toHaveText("HR: 3 people");
  });

  test("closing the card in one view clears the selection for the others", async ({ page }) => {
    await page.goto("/map?person=p_bob");
    await expectMapFocus(page, bob);
    await page
      .getByRole("complementary", { name: "Bob Lindqvist details" })
      .getByRole("button", { name: "Close card" })
      .click();
    await expect(tab(page, "Org chart")).toHaveAttribute("href", "/org");

    await tab(page, "Org chart").click();
    await expect(page.locator("[data-org-chart] [data-selected]")).toHaveCount(0);
    await expect(page.getByText("Select someone to see their card.")).toBeVisible();
  });
});
