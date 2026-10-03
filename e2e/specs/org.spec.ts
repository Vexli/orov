import { expect, test, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

const node = (page: Page, id: string) => page.locator(`[data-org-chart] [data-org-node="${id}"]`);

test.describe("org chart", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("opens the reporting tree from the top, with two levels below it", async ({ page }) => {
    await page.goto("/org");
    await expect(page.getByRole("heading", { name: "Org chart" })).toBeVisible();
    const chart = page.getByRole("group", { name: "Reporting lines chart" });
    await expect(node(page, "p_jane")).toContainText("Jane Park");
    await expect(node(page, "p_jane")).toContainText("Head of HR");
    await expect(node(page, "p_max")).toBeVisible();
    for (const id of ["p_bob", "p_priya", "p_sam"]) await expect(node(page, id)).toBeVisible();
    await expect(chart.locator("path.link")).toHaveCount(4);
  });

  test("clicking a person selects them and shows their card", async ({ page }) => {
    await page.goto("/org");
    await node(page, "p_bob").click();
    await expect(page).toHaveURL(/person=p_bob/);
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toBeVisible();
    await expect(node(page, "p_bob")).toHaveAttribute("data-selected", "");
    await expect(node(page, "p_max")).not.toHaveAttribute("data-selected", "");
  });

  test("the team tree nests sub-teams under HR and lists members, and is kept in the URL", async ({
    page,
  }) => {
    await page.goto("/org");
    await page.getByRole("group", { name: "Tree" }).getByRole("button", { name: "Teams" }).click();
    await expect(page).toHaveURL(/tree=team/);
    await expect(page.getByRole("group", { name: "Teams chart" })).toBeVisible();
    await expect(node(page, "t_hr")).toContainText("3 members");
    await expect(node(page, "t_payroll")).toBeVisible();
    await expect(node(page, "t_recruiting")).toBeVisible();
    // Bob is in Payroll (primary) and in HR, so he appears under both.
    await expect(node(page, "t_hr:p_bob")).toBeVisible();

    await page.reload();
    await expect(node(page, "t_payroll")).toBeVisible();
  });

  test("a keyboard user selects someone from the list, and the chart shows the same selection", async ({
    page,
  }) => {
    await page.goto("/org?view=list");
    const outline = page.getByRole("navigation", { name: "Reporting lines chart" });
    await expect(outline.getByRole("button", { name: /Jane Park/ })).toBeVisible();
    const bob = outline.getByRole("button", { name: /Bob Lindqvist/ });
    await bob.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/person=p_bob/);
    await expect(bob).toHaveAttribute("aria-current", "true");

    await page
      .getByRole("group", { name: "Display" })
      .getByRole("button", { name: "Chart" })
      .click();
    await expect(page).not.toHaveURL(/view=/);
    await expect(node(page, "p_bob")).toHaveAttribute("data-selected", "");
  });

  test("the Org chart tab is in the shell and marked current", async ({ page }) => {
    await page.goto("/directory");
    await page
      .getByRole("navigation", { name: "Views" })
      .getByRole("link", { name: "Org chart" })
      .click();
    await expect(page).toHaveURL(/\/org/);
    await expect(page.getByRole("link", { name: "Org chart" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
