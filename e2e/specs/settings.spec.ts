import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// Each user picks how region codes appear (plan.md §7): ISO 3166 code, country name, region
// name, or region and country name. The setting is theirs alone.
test.describe("region display setting", () => {
  test.beforeEach(resetE2eDatabase);

  test("defaults to region and country names, and each option changes the directory", async ({ page, context }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/settings");
    await expect(page.getByRole("radio", { name: /Region and country name/ })).toBeChecked();

    const expectations: [RegExp, string][] = [
      [/ISO 3166 code/, "Based in CA-ON · Desk SF-2-003"],
      [/^Country name/, "Based in Canada · Desk SF-2-003"],
      [/^Region name/, "Based in Ontario · Desk SF-2-003"],
      [/Region and country name/, "Based in Ontario, Canada · Desk SF-2-003"],
    ];
    for (const [option, label] of expectations) {
      await page.goto("/settings");
      await page.getByRole("radio", { name: option }).check();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status")).toContainText("Settings saved");
      await expect(page.getByRole("radio", { name: option })).toBeChecked();

      await page.goto("/directory?person=p_jane");
      await expect(page.getByRole("complementary", { name: "Jane Park details" })).toContainText(label);
    }
  });

  test("a country-only code falls back to the country name for the region option", async ({ page, context }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/settings");
    await page.getByRole("radio", { name: /^Region name/ }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toContainText("Settings saved");

    // Sam's home region is just "US".
    await page.goto("/directory?person=p_sam");
    await expect(page.getByRole("complementary", { name: "Sam Ortiz details" })).toContainText("Remote – United States");
  });

  test("one user's choice doesn't change what anyone else sees", async ({ browser }) => {
    const bob = await browser.newContext();
    await signInAs(bob, "bob@example.com");
    const bobPage = await bob.newPage();
    await bobPage.goto("/settings");
    await bobPage.getByRole("radio", { name: /ISO 3166 code/ }).check();
    await bobPage.getByRole("button", { name: "Save settings" }).click();
    await expect(bobPage.getByRole("status")).toContainText("Settings saved");

    const max = await browser.newContext();
    await signInAs(max, "max@example.com");
    const maxPage = await max.newPage();
    await maxPage.goto("/directory?person=p_jane");
    await expect(maxPage.getByRole("complementary", { name: "Jane Park details" })).toContainText(
      "Based in Ontario, Canada",
    );

    await bob.close();
    await max.close();
  });

  test("is reachable from the top bar", async ({ page, context }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/directory");
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });
});
