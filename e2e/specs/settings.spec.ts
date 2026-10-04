import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// Each user picks how region codes appear (plan.md §7): ISO 3166 code, country name, region
// name, or region and country name. The setting is theirs alone.
test.describe("region display setting", () => {
  test.beforeEach(resetE2eDatabase);

  test("defaults to region and country names, and each option changes the directory", async ({
    page,
    context,
  }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/settings");
    await expect(page.getByRole("radio", { name: /Region and country name/ })).toBeChecked();

    const expectations: [RegExp, string][] = [
      [/ISO 3166 code/, "CA-ON SF-2-003"],
      [/^Country name/, "Canada SF-2-003"],
      [/^Region name/, "Ontario SF-2-003"],
      [/Region and country name/, "Ontario, Canada SF-2-003"],
    ];
    for (const [option, label] of expectations) {
      await page.goto("/settings");
      await page.getByRole("radio", { name: option }).check();
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByRole("status")).toContainText("Settings saved");
      await expect(page.getByRole("radio", { name: option })).toBeChecked();

      await page.goto("/directory?person=p_jane");
      await expect(page.getByRole("complementary", { name: "Jane Park details" })).toContainText(
        label,
      );
    }
  });

  test("a country-only code falls back to the country name for the region option", async ({
    page,
    context,
  }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/settings");
    await page.getByRole("radio", { name: /^Region name/ }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toContainText("Settings saved");

    // Sam's home region is just "US". They have a desk on Floor 3.
    await page.goto("/directory?person=p_sam");
    await expect(page.getByRole("complementary", { name: "Sam Ortiz details" })).toContainText(
      "United States SF-3-001",
    );
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
      "Ontario, Canada SF-2-003",
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

// Each user also picks how dates appear (#27). Times are shown in their home time zone.
test.describe("date format setting", () => {
  test.beforeEach(resetE2eDatabase);

  test("switching to day/month/year changes the audit log for that user only", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    // Something in the log to look at.
    await page.goto("/admin/people/p_bob");
    await page.getByLabel("Title").fill("Senior Payroll Analyst");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);

    const when = page.locator("tbody tr").first().locator("td").first();
    await page.goto("/admin/audit");
    // ISO is the default, in Jane's home time zone (Toronto), with the zone shown.
    await expect(when).toHaveText(/^\d{4}-\d\d-\d\d \d\d:\d\d E[DS]T$/);

    await page.goto("/settings");
    await expect(page.getByRole("radio", { name: /Year-month-day/ })).toBeChecked();
    await expect(page.getByText("Times are shown in America/Toronto.")).toBeVisible();
    await page.getByRole("radio", { name: /Day\/month\/year/ }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status")).toContainText("Settings saved");

    await page.goto("/admin/audit");
    await expect(when).toHaveText(/^\d\d\/\d\d\/\d{4} \d\d:\d\d E[DS]T$/);

    // Max's setting is still the default.
    await context.clearCookies();
    await signInAs(context, "max@example.com");
    await page.goto("/settings");
    await expect(page.getByRole("radio", { name: /Year-month-day/ })).toBeChecked();
  });
});
