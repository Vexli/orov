import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// Viewers (not admins) use the directory, so the suite signs in as Bob.
test.describe("directory", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("U1: search finds Bob, and his card shows his seat", async ({ page }) => {
    await page.goto("/directory");
    await page.getByRole("searchbox", { name: "Search people" }).fill("bob");
    await expect(page.getByRole("status")).toContainText("Showing 1 of 5");

    await page.getByRole("button", { name: /Bob Lindqvist/ }).click();
    await expect(page).toHaveURL(/person=p_bob/);

    const card = page.getByRole("complementary", { name: "Bob Lindqvist details" });
    await expect(card).toContainText("SF-2-014 · San Francisco, Floor 2");
    await expect(card).toContainText("Based in California, United States · Desk SF-2-014");
    await expect(card.getByRole("button", { name: "Max Osei" })).toBeVisible();
  });

  test("U4: Jane is based in Canada and still has a desk in San Francisco", async ({ page }) => {
    await page.goto("/directory?person=p_jane");
    const card = page.getByRole("complementary", { name: "Jane Park details" });
    await expect(card).toContainText("Based in Ontario, Canada · Desk SF-2-003");
    await expect(card).toContainText("SF-2-003 · San Francisco, Floor 2");
  });

  test("U2 (directory part): a team includes its sub-teams only when asked", async ({ page }) => {
    await page.goto("/directory");
    await page.getByRole("combobox", { name: "Filter by team" }).selectOption({ label: "HR" });
    await expect(page.getByRole("status")).toContainText("Showing 3 of 5");

    await page.getByRole("checkbox", { name: "Include sub-teams" }).check();
    await expect(page.getByRole("status")).toContainText("Showing 5 of 5");
    await expect(page).toHaveURL(/team=t_hr/);
    await expect(page).toHaveURL(/sub=true/);
  });

  test("someone remote shows their home region, and no seat", async ({ page }) => {
    await page.goto("/directory?person=p_priya");
    const card = page.getByRole("complementary", { name: "Priya Raman details" });
    await expect(card).toContainText("Remote – Karnātaka, India");
    await expect(card).toContainText("No desk assigned");
  });

  test("the manager link on a card moves the selection up the chain", async ({ page }) => {
    await page.goto("/directory?person=p_bob");
    await page.getByRole("complementary", { name: "Bob Lindqvist details" }).getByRole("button", { name: "Max Osei" }).click();
    await expect(page).toHaveURL(/person=p_max/);
    await expect(page.getByRole("complementary", { name: "Max Osei details" })).toBeVisible();
  });

  test("selection and filters survive a reload, which is how shared links work", async ({ page }) => {
    await page.goto("/directory?person=p_bob&team=t_hr&sub=true&desk=true");
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Has a desk" })).toBeChecked();
    await expect(page.getByRole("status")).toContainText("Showing 3 of 5");

    await page.reload();
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Showing 3 of 5");
  });

  test("clearing filters restores the full list", async ({ page }) => {
    await page.goto("/directory?desk=true&q=zzz");
    await expect(page.getByText("No one matches these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByRole("status")).toContainText("Showing 5 of 5");
    await expect(page).not.toHaveURL(/q=|desk=/);
  });
});
