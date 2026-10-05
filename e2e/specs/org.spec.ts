import { expect, test, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

const node = (page: Page, id: string) => page.locator(`[data-org-chart] [data-org-node="${id}"]`);

// The expand/collapse button d3-org-chart draws under a node with children. A click lands on its
// foreignObject, which the node's own click handler skips, so toggling doesn't also select.
const toggle = (page: Page, id: string) =>
  page
    .locator("[data-org-chart] g.node", { has: page.locator(`[data-org-node="${id}"]`) })
    .locator(".node-button-foreign-object");

// True when the node is drawn inside the chart's visible area.
async function inView(page: Page, id: string): Promise<boolean> {
  const chart = await page.locator("[data-org-chart]").boundingBox();
  const box = await node(page, id).boundingBox();
  if (!chart || !box) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return cx > chart.x && cx < chart.x + chart.width && cy > chart.y && cy < chart.y + chart.height;
}

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

test.describe("org chart focus and highlight", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await signInAs(context, "bob@example.com");
  });

  test("U3: Bob reports to Max, and Max reports to Jane", async ({ page }) => {
    await page.goto("/org?person=p_bob");
    const line = page.getByRole("region", { name: "Reporting line" });
    await expect(line.getByRole("listitem")).toHaveText([
      "Jane Park",
      "↳ Max Osei",
      "↳ Bob Lindqvist",
    ]);
    await expect(node(page, "p_bob")).toHaveAttribute("data-selected", "");
    await expect.poll(() => inView(page, "p_bob")).toBe(true);

    // Walking up the line moves the selection, and the chart follows.
    await line.getByRole("button", { name: "Max Osei" }).click();
    await expect(page).toHaveURL(/person=p_max/);
    await expect(line.getByRole("listitem")).toHaveText(["Jane Park", "↳ Max Osei"]);
    await expect(node(page, "p_max")).toHaveAttribute("data-selected", "");
  });

  test("selecting someone opens their direct reports, even after they were collapsed", async ({
    page,
  }) => {
    await page.goto("/org?person=p_bob");
    await expect(node(page, "p_bob")).toBeVisible();
    await toggle(page, "p_max").click();
    await expect(node(page, "p_bob")).toHaveCount(0);

    await page
      .getByRole("region", { name: "Reporting line" })
      .getByRole("button", { name: "Max Osei" })
      .click();
    await expect(node(page, "p_bob")).toBeVisible();
    await expect(node(page, "p_priya")).toBeVisible();
  });

  test("the top person has no one above them", async ({ page }) => {
    await page.goto("/org?person=p_jane");
    await expect(page.getByRole("region", { name: "Reporting line" })).toContainText(
      "Jane Park doesn't report to anyone.",
    );
  });

  test("a highlighted team lights up its members, with sub-teams unless they're turned off", async ({
    page,
  }) => {
    await page.goto("/org");
    await page.getByLabel("Highlight team").selectOption({ label: "HR" });
    await expect(page).toHaveURL(/team=t_hr/);
    await expect(page.getByRole("status", { name: "Highlighted team" })).toHaveText(
      "HR and sub-teams: 5 people",
    );
    const lit = page.locator("[data-org-chart] [data-highlighted]");
    await expect(lit).toHaveCount(5);

    await page.getByLabel("Include sub-teams").uncheck();
    await expect(page).toHaveURL(/sub=false/);
    await expect(page.getByRole("status", { name: "Highlighted team" })).toHaveText(
      "HR: 3 people",
    );
    await expect(lit).toHaveCount(3);
    await expect(node(page, "p_priya")).not.toHaveAttribute("data-highlighted", "");
  });

  test("in the team tree, a team, its sub-teams and their members light up, and clicking a team highlights it", async ({
    page,
  }) => {
    await page.goto("/org?tree=team&team=t_hr&sub=true");
    const lit = page.locator("[data-org-chart] [data-highlighted]");
    // 3 teams, plus HR's Jane, Max and Bob, Payroll's Bob, and Recruiting's Priya and Sam.
    await expect(lit).toHaveCount(9);
    for (const id of ["t_hr", "t_payroll", "t_recruiting", "t_hr:p_jane", "t_payroll:p_bob", "t_recruiting:p_sam"]) {
      await expect(node(page, id)).toHaveAttribute("data-highlighted", "");
    }

    await node(page, "t_payroll").click();
    await expect(page).toHaveURL(/team=t_payroll/);
    await expect(page.getByRole("status", { name: "Highlighted team" })).toHaveText(
      "Payroll and sub-teams: 1 person",
    );
    // Payroll and Bob's membership of it. His node under HR is outside the scope.
    await expect(lit).toHaveCount(2);
    await expect(node(page, "t_payroll:p_bob")).toHaveAttribute("data-highlighted", "");
    await expect(node(page, "t_hr:p_bob")).not.toHaveAttribute("data-highlighted", "");
  });

  test("in the team tree, a person is centered on their primary team", async ({ page }) => {
    await page.goto("/org?tree=team&person=p_bob");
    await expect(node(page, "t_payroll:p_bob")).toHaveAttribute("data-selected", "");
    await expect(node(page, "t_hr:p_bob")).not.toHaveAttribute("data-selected", "");
    await expect.poll(() => inView(page, "t_payroll:p_bob")).toBe(true);
  });

  test("the outline marks the highlighted team's members", async ({ page }) => {
    await page.goto("/org?view=list&team=t_payroll");
    const outline = page.getByRole("navigation", { name: "Reporting lines chart" });
    await expect(outline.getByRole("button", { name: /Bob Lindqvist/ })).toContainText("In team");
    await expect(outline.getByRole("button", { name: /Max Osei/ })).not.toContainText("In team");
  });

  test("the team outline marks the highlighted team's member rows too", async ({ page }) => {
    await page.goto("/org?view=list&tree=team&team=t_recruiting");
    const outline = page.getByRole("navigation", { name: /chart/ });
    await expect(outline.getByRole("button", { name: /Priya Raman/ })).toContainText("In team");
    await expect(outline.getByRole("button", { name: /^Max Osei/ })).not.toContainText("In team");
  });
});
