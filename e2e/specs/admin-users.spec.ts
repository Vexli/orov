import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

test.describe("admin users", () => {
  test.beforeEach(resetE2eDatabase);

  test("disabling a user signs them out at once, and enabling lets them back in", async ({
    page,
    context,
    browser,
  }) => {
    const bobContext = await browser.newContext();
    const bob = await bobContext.newPage();
    await signInAs(bobContext, "bob@example.com");
    await bob.goto("/directory");
    await expect(bob).toHaveURL(/\/directory/);

    await signInAs(context, "jane@example.com");
    await page.goto("/admin/users");
    const row = page.getByRole("row", { name: /bob@example\.com/ });
    await expect(row).toContainText("Active");
    await row.getByRole("button", { name: "Disable" }).click();
    await expect(row).toContainText("Disabled");
    await expect(row.getByRole("button", { name: "Enable" })).toBeVisible();

    // The session is gone: the next page load is a signed-out one.
    await bob.goto("/directory");
    await expect(bob).toHaveURL(/\/login/);

    await row.getByRole("button", { name: "Enable" }).click();
    await expect(row).toContainText("Active");
    await signInAs(bobContext, "bob@example.com");
    await bob.goto("/directory");
    await expect(bob).toHaveURL(/\/directory/);
    await bobContext.close();
  });

  test("someone marked inactive in People loses access on their next request", async ({
    page,
    context,
    browser,
  }) => {
    const bobContext = await browser.newContext();
    const bob = await bobContext.newPage();
    await signInAs(bobContext, "bob@example.com");

    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/p_bob");
    await page.getByLabel("Active").uncheck();
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);

    await bob.goto("/directory");
    await expect(bob).toHaveURL(/\/login/);
    await page.goto("/admin/users");
    await expect(page.getByRole("row", { name: /bob@example\.com/ })).toContainText(
      "Inactive in People",
    );
    await bobContext.close();
  });

  test("an admin changes a role, can't change their own, and the change is audited", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/users");
    const self = page.getByRole("row", { name: /jane@example\.com/ });
    await expect(self.getByLabel("Role for jane@example.com")).toBeDisabled();
    await expect(self).toContainText("You");

    await page.getByLabel("Role for max@example.com").selectOption("admin");
    await expect(page.getByLabel("Role for max@example.com")).toHaveValue("admin");
    await page.reload();
    await expect(page.getByLabel("Role for max@example.com")).toHaveValue("admin");

    await page.goto("/admin/audit?entity=app_user");
    await expect(page.locator("tbody tr").first()).toContainText("max@example.com");
  });
});
