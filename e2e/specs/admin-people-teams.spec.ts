import { expect, test, type Locator, type Page } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// Picks an option by its visible text, which may be a regex, and resolves to its value.
async function chooseOption(page: Page, select: Locator, text: RegExp) {
  const option = select.locator("option").filter({ hasText: text });
  await select.selectOption((await option.getAttribute("value")) ?? "");
}

test.describe("admin people and teams", () => {
  test.beforeEach(resetE2eDatabase);

  test("a viewer is turned away from the admin pages", async ({ page, context }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/admin/people");
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(page.getByRole("heading", { name: "Admins only" })).toBeVisible();
  });

  test("an admin creates a person with a manager, a seat, teams and a primary team", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/new");

    await page.getByLabel("Full name").fill("Ama Ito");
    await page.getByLabel("Email").fill("ama@example.com");
    await page.getByLabel("Title").fill("Recruiter");
    await page.getByLabel("Manager").selectOption({ label: "Max Osei" });
    await chooseOption(page, page.getByLabel("Desk"), /SF-2-016/);
    await page.getByLabel("Member of Recruiting").check();
    await page.getByLabel("Primary team Recruiting").check();
    await page.getByRole("button", { name: "Create person" }).click();

    await expect(page).toHaveURL(/\/admin\/people$/);
    const row = page.getByRole("row", { name: /Ama Ito/ });
    await expect(row).toContainText("ama@example.com");
    await expect(row).toContainText("Max Osei");
    await expect(row).toContainText("SF-2-016");
    await expect(row).toContainText("Recruiting");
  });

  test("a duplicate email is refused next to the field", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/new");
    await page.getByLabel("Full name").fill("Impostor");
    await page.getByLabel("Email").fill("bob@example.com");
    await page.getByRole("button", { name: "Create person" }).click();
    await expect(page.getByText("Another person already uses this email.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/people\/new$/);
  });

  test("an admin sets profile accounts, and the person card links to them", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/p_max");

    // Bob already has this GitHub account, so it's refused next to the field.
    await page.getByLabel("GitHub").fill("https://github.com/bob-lindqvist");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page.getByText("Bob Lindqvist already has this GitHub account.")).toBeVisible();

    await page.getByLabel("GitHub").fill("@MaxOsei");
    await page.getByLabel("LinkedIn").fill("https://www.linkedin.com/in/max-osei/");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);

    await page.goto("/directory?person=p_max");
    const card = page.getByRole("complementary", { name: "Max Osei details" });
    const github = card.getByRole("link", { name: "GitHub: maxosei (opens in a new tab)" });
    await expect(github).toHaveAttribute("href", "https://github.com/maxosei");
    await expect(github).toHaveAttribute("rel", "noopener noreferrer");
    await expect(card.getByRole("link", { name: /^LinkedIn: max-osei/ })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/max-osei",
    );
  });

  test("pickers hide managers that would create a loop, and name who holds each desk", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");

    // Jane is the top of the chain. Bob and Max both report to her, directly or not, so neither
    // can be picked as her manager.
    await page.goto("/admin/people/p_jane");
    const managers = page.getByLabel("Manager").locator("option");
    await expect(managers.filter({ hasText: "Bob Lindqvist" })).toHaveCount(0);
    await expect(managers.filter({ hasText: "Max Osei" })).toHaveCount(0);
    await expect(managers.filter({ hasText: "Priya Raman" })).toHaveCount(0);
    await expect(managers.filter({ hasText: "Sam Ortiz" })).toHaveCount(0);

    // Max's form: Bob's SF-2-014 is offered as a swap and names him. Max's own SF-2-010 doesn't.
    await page.goto("/admin/people/p_max");
    const desks = page.getByLabel("Desk").locator("option");
    await expect(desks.filter({ hasText: "SF-2-014" })).toHaveText(/\(Bob Lindqvist\)/);
    await expect(desks.filter({ hasText: "SF-2-010" })).not.toHaveText(/\(/);
  });

  test("the seat picker chooses a desk by clicking the floor drawing", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/p_priya");
    await page
      .getByRole("group", { name: "Seat picker floor" })
      .getByRole("button", { name: "San Francisco, Floor 3" })
      .click();
    await page.locator("[data-seat-picker] #desk-3-005").click();
    await expect(page.getByLabel("Desk")).toHaveValue("sp_sf_3_005");

    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole("row", { name: /Priya Raman/ })).toContainText("SF-3-005");
  });

  test("taking someone's desk needs a confirmed swap, and they get the old desk", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/p_max");
    await page.locator("[data-seat-picker] #desk-2-014").click();
    const swap = page.getByRole("checkbox", {
      name: /SF-2-014 is Bob Lindqvist's desk.*moves to SF-2-010/,
    });
    await expect(swap).not.toBeChecked();

    // Without the swap, the server refuses and says why.
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page.getByText(/already assigned to Bob Lindqvist/)).toBeVisible();

    await swap.check();
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole("row", { name: /^Max Osei/ })).toContainText("SF-2-014");
    await expect(page.getByRole("row", { name: /^Bob Lindqvist/ })).toContainText("SF-2-010");
  });

  test("a sub-team is created under HR and appears nested beneath it", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/teams/new");
    await page.getByLabel("Name").fill("Benefits");
    await page.getByLabel("Slug").fill("benefits");
    await page.getByLabel("Parent team").selectOption({ label: "HR" });
    await page.getByRole("button", { name: "Create team" }).click();

    await expect(page).toHaveURL(/\/admin\/teams$/);
    const rows = page.getByRole("row");
    const names = await rows.allTextContents();
    const hr = names.findIndex((t) => t.includes("HR") && t.includes("hr"));
    const benefits = names.findIndex((t) => t.includes("Benefits"));
    expect(hr).toBeGreaterThan(-1);
    expect(benefits).toBeGreaterThan(hr);
  });

  test("a team with members can't be deleted, and the reason is shown", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/teams/t_payroll");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete team" }).click();
    await expect(page.getByText("Move the 1 member(s) out of Payroll first.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/teams\/t_payroll$/);
  });
});
