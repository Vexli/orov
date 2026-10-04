import { expect, test } from "@playwright/test";
import { resetE2eDatabase, withE2eDb } from "../support/database";
import { signInAs, switchUser } from "../support/session";

// #20: anyone can change a few things about themself without an admin.
test.describe("my profile", () => {
  test.beforeEach(resetE2eDatabase);

  test("a viewer changes their preferred name and phone, and the change is theirs in the audit log", async ({
    page,
    context,
  }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/directory");
    await page.getByRole("link", { name: "My profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText("An admin manages your name, title, manager, desk and teams.")).toBeVisible();

    await page.getByLabel("Phone").fill("not a number");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText(/Phone isn't a valid number/)).toBeVisible();

    await page.getByLabel("Preferred name").fill("Bobby");
    await page.getByLabel("Phone").fill("(415) 555-0188");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("status")).toHaveText("Profile saved.");
    await expect(page.getByLabel("Phone")).toHaveValue("+14155550188");

    await page.goto("/directory?person=p_bob");
    const card = page.getByRole("complementary", { name: "Bobby details" });
    await expect(card.getByRole("link", { name: "+1 415 555 0188" })).toBeVisible();

    await switchUser(page, context, "jane@example.com");
    await page.goto("/admin/audit?entity=person");
    const entry = page.locator("tbody tr").first();
    await expect(entry).toContainText("bob@example.com");
    await expect(entry).toContainText('preferredName: null → "Bobby"');
  });

  test("someone who isn't in the directory is told so", async ({ page, context }) => {
    // Signed in before (so they have an account), but not added to the directory.
    await withE2eDb((db) => db.$client.query("INSERT INTO app_user (email) VALUES ('newhire@example.com')"));
    await signInAs(context, "newhire@example.com");
    await page.goto("/profile");
    await expect(page.getByText(/isn't linked to a person in the directory yet/)).toBeVisible();
  });
});
