import { expect, test, type Locator, type Page } from "@playwright/test";
import { getPersonForEdit, savePerson } from "@orov/db/queries/people";
import { resetE2eDatabase, withE2eDb } from "../support/database";
import { signInAs, switchUser } from "../support/session";

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

    await page.getByLabel("Given name").fill("Ama");
    await page.getByLabel("Family name").fill("Ito");
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

  test("a new person's blank time zone comes from their desk's office", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/new");
    await page.getByLabel("Given name").fill("Ama");
    await page.getByLabel("Family name").fill("Ito");
    await page.getByLabel("Email").fill("ama@example.com");
    await chooseOption(page, page.getByLabel("Desk"), /SF-2-016/);
    await expect(page.getByLabel("Home timezone")).toHaveAttribute(
      "placeholder",
      "America/Los_Angeles (from San Francisco)",
    );
    await page.getByRole("button", { name: "Create person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);

    await page.getByRole("row", { name: /Ama Ito/ }).getByRole("link", { name: "Edit" }).click();
    await expect(page.getByLabel("Home timezone")).toHaveValue("America/Los_Angeles");
  });

  test("a phone number is stored in international form and dialled from the card", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    // Max is based in the US, so a number without a country code is read as a US number.
    await page.goto("/admin/people/p_max");
    await page.getByLabel("Phone").fill("not a number");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page.getByText(/Phone isn't a valid number/)).toBeVisible();

    await page.getByLabel("Phone").fill("(415) 555-0177");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await page.goto("/directory?person=p_max");
    const link = page
      .getByRole("complementary", { name: "Max Osei details" })
      .getByRole("link", { name: "+1 415 555 0177" });
    await expect(link).toHaveAttribute("href", "tel:+14155550177");
  });

  test("numbers stored before validation are listed for fixing", async ({ page, context }) => {
    // savePerson trusts its input (the action validates first), so this stores a number the way
    // one was stored before validation existed.
    await withE2eDb(async (db) => {
      const sam = (await getPersonForEdit(db, "p_sam"))!;
      await savePerson(db, "jane@example.com", { ...sam, phone: "ext 4411" }, "p_sam");
    });
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people");
    const report = page.getByRole("region", { name: "Phone numbers to fix" });
    await expect(report).toContainText("1 phone number isn't in a standard format");
    await expect(report.getByRole("link", { name: "Sam Ortiz" })).toHaveAttribute("href", "/admin/people/p_sam");
  });

  test("a new person with no manager gets their primary team's lead", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/new");
    await page.getByLabel("Given name").fill("Ama");
    await page.getByLabel("Family name").fill("Ito");
    await page.getByLabel("Email").fill("ama@example.com");
    await page.getByLabel("Member of HR").check();
    await page.getByLabel("Primary team HR").check();
    await expect(page.getByLabel("Manager").locator("option").first()).toHaveText("Default: Jane Park, lead of HR");
    await page.getByRole("button", { name: "Create person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole("row", { name: /Ama Ito/ })).toContainText("Jane Park");
  });

  test("joining a sub-team makes someone a member of the teams above it", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    // Priya is in Recruiting, so she's in HR through it.
    await page.goto("/directory?person=p_priya");
    const card = page.getByRole("complementary", { name: "Priya Raman details" });
    await expect(card.getByText("HR (through a sub-team)")).toBeAttached();

    await page.goto("/admin/people/p_priya");
    const hr = page.getByLabel("Member of HR", { exact: true });
    await expect(hr).toBeChecked();
    await expect(hr).toBeDisabled();
    await expect(page.getByText("through Recruiting")).toBeVisible();

    // Moving her to Payroll keeps HR (through Payroll); taking her out of every team drops it.
    await page.getByLabel("Member of Recruiting", { exact: true }).uncheck();
    await expect(hr).not.toBeChecked();
    await page.getByLabel("Member of Payroll", { exact: true }).check();
    await expect(page.getByText("through Payroll")).toBeVisible();
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole("row", { name: /Priya Raman/ })).toContainText("HR (through a sub-team)");
  });

  test("people and teams are listed alphabetically in dropdowns", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/new");
    // The people list sorts by family name; a dropdown reads by the name it shows.
    await expect(page.getByLabel("Manager").locator("option")).toHaveText([
      "No manager",
      "Bob Lindqvist",
      "Jane Park",
      "Max Osei",
      "Priya Raman",
      "Sam Ortiz",
    ]);
    await page.goto("/admin/people");
    await expect(page.getByLabel("Filter by team").locator("option")).toHaveText(["All teams", "HR", "Payroll", "Recruiting"]);
  });

  test("an admin records a last day, which viewers never see", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/p_bob");
    await page.getByLabel("Last day").fill("2022-01-01");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page.getByText("The last day can't be before the start date")).toBeVisible();

    await page.getByLabel("Last day").fill("2026-12-31");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole("row", { name: /bob@example\.com/ })).toContainText("Last day 2026-12-31");

    await switchUser(page, context, "max@example.com");
    for (const path of ["/directory?person=p_bob", "/org?person=p_bob", "/map?person=p_bob"]) {
      await page.goto(path);
      await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toBeVisible();
      // Not in the page, nor in the data sent with it.
      expect(await page.content()).not.toContain("2026-12-31");
    }
  });

  test("someone without a desk can belong to an office", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    // Bob has a desk, so his office comes from it.
    await page.goto("/admin/people/p_bob");
    await expect(page.getByRole("combobox", { name: /^Office/ })).toBeDisabled();

    await page.goto("/admin/people/p_priya");
    await page.getByRole("combobox", { name: /^Office/ }).selectOption({ label: "San Francisco" });
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole("row", { name: /priya@example\.com/ })).toContainText("San Francisco, no desk");

    await page.goto("/directory?person=p_priya");
    await expect(page.getByRole("complementary", { name: "Priya Raman details" })).toContainText(
      "Karnātaka, India San Francisco",
    );
    await page.getByLabel("Filter by location").selectOption({ label: "San Francisco" });
    await expect(page.locator("#person-row-p_priya")).toBeVisible();

    await page.goto("/map?loc=sf");
    await expect(page.getByRole("complementary", { name: "San Francisco overview" })).toContainText(
      "1 person works here without a desk.",
    );
  });

  test("someone can have two managers, and appears under both in the reporting chart", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/p_priya");
    await expect(page.getByRole("list", { name: "Managers" }).getByRole("listitem")).toHaveText(["Max Osei×"]);
    await page.getByRole("combobox", { name: /^Manager/ }).selectOption({ label: "Jane Park" });
    await expect(page.getByRole("list", { name: "Managers" }).getByRole("listitem")).toHaveText([
      "Max Osei×",
      "Jane Park×",
    ]);
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole("row", { name: /priya@example\.com/ })).toContainText("Max Osei, Jane Park");

    await page.goto("/org?view=list&person=p_priya");
    const outline = page.getByRole("navigation", { name: "Reporting lines chart" });
    // One entry under Max and one under Jane, both shown as selected.
    await expect(outline.getByRole("button", { name: /Priya Raman/ })).toHaveCount(2);
    await expect(outline.locator('[aria-current="true"]')).toHaveCount(2);
    const card = page.getByRole("complementary", { name: "Priya Raman details" });
    await expect(card).toContainText("Managers");
    await expect(card.getByRole("button", { name: "Jane Park" })).toBeVisible();
  });

  test("a duplicate email is refused next to the field", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/new");
    await page.getByLabel("Given name").fill("Impostor");
    await page.getByLabel("Email").fill("bob@example.com");
    await page.getByRole("button", { name: "Create person" }).click();
    await expect(page.getByText("Another person already uses this email.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/people\/new$/);
  });

  test("an inactive person is struck through in the list, and labelled for screen readers", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/p_sam");
    await page.getByLabel("Active").uncheck();
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    // The list shows active people unless asked.
    await expect(page.getByRole("row", { name: /Sam Ortiz/ })).toHaveCount(0);
    await page.getByLabel("Filter by status").selectOption("all");

    const sam = page.getByRole("row", { name: /Sam Ortiz/ });
    await expect(sam).toHaveAccessibleName(/Sam Ortiz \(inactive\)/);
    await expect(sam.getByText("Sam Ortiz", { exact: false }).first()).toHaveClass(/line-through/);
    const max = page.getByRole("row", { name: /max@example\.com/ });
    await expect(max).not.toHaveAccessibleName(/inactive/);
    await expect(max.getByText("Max Osei").first()).not.toHaveClass(/line-through/);
  });

  test("the people list filters by text, team and desk, and keeps the filters in the URL", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people");
    const status = page.getByRole("status");
    await expect(status).toHaveText("Showing 5 of 5");

    // Every word must match somewhere: "max" is Max himself and the manager of Bob, Priya and Sam.
    await page.getByLabel("Search people").fill("max");
    await expect(status).toHaveText("Showing 4 of 5");
    await page.getByLabel("Search people").fill("max payroll");
    await expect(status).toHaveText("Showing 1 of 5");
    await expect(page.getByRole("row", { name: /Bob Lindqvist/ })).toBeVisible();
    await expect(page).toHaveURL(/q=max\+payroll/);

    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.getByLabel("Filter by team").selectOption({ label: "Recruiting" });
    await expect(status).toHaveText("Showing 2 of 5");
    await page.getByLabel("Filter by desk").selectOption("without");
    await expect(status).toHaveText("Showing 1 of 5");
    await expect(page.getByRole("row", { name: /Priya Raman/ })).toBeVisible();

    // A reload, or a shared link, gives the same list. nuqs writes the URL a moment after the
    // change, so wait for it first.
    await expect(page).toHaveURL(/team=t_recruiting.*desk=without|desk=without.*team=t_recruiting/);
    await page.reload();
    await expect(status).toHaveText("Showing 1 of 5");
    await expect(page.getByLabel("Filter by desk")).toHaveValue("without");
  });

  test("an admin deactivates several people at once after reviewing the change", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people");
    for (const name of ["Bob Lindqvist", "Priya Raman", "Sam Ortiz"]) {
      await page.getByLabel(`Select ${name}`).check();
    }
    const bar = page.getByRole("region", { name: "Change selected people" });
    await expect(bar).toContainText("3 selected");
    await bar.getByLabel("Change").selectOption({ label: "Deactivate" });
    await bar.getByRole("button", { name: "Review change" }).click();

    const dialog = page.getByRole("dialog", { name: "Deactivate for 3 people?" });
    await expect(dialog.getByRole("listitem")).toHaveText(["Bob Lindqvist", "Sam Ortiz", "Priya Raman"]);
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("status", { name: "Bulk change result" })).toHaveText(
      "Deactivate · 3 people updated.",
    );
    // The default filter shows active people, so they're gone from the list.
    await expect(page.getByRole("status").first()).toHaveText("Showing 2 of 5");
  });

  test("a bulk manager change that would loop changes nobody, and names who blocked it", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people");
    await page.getByLabel("Select Priya Raman").check();
    await page.getByLabel("Select Max Osei").check();
    const bar = page.getByRole("region", { name: "Change selected people" });
    await bar.getByLabel("Change").selectOption({ label: "Set manager" });
    await bar.getByLabel("New manager").selectOption({ label: "Bob Lindqvist" });
    await bar.getByRole("button", { name: "Review change" }).click();
    const dialog = page.getByRole("dialog", { name: "Set manager: Bob Lindqvist for 2 people?" });
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/^Max Osei: Bob Lindqvist reports/);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("row", { name: /priya@example\.com/ })).toContainText("Max Osei");
  });

  test("the teams list search keeps a match's parent team", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/teams");
    await page.getByLabel("Search teams").fill("payr");
    await expect(page.getByRole("status")).toHaveText("1 of 3 match");
    await expect(page.getByRole("row", { name: /Payroll/ })).toBeVisible();
    // HR stays, so Payroll still shows nested under it.
    await expect(page.getByRole("row", { name: /^HR/ })).toBeVisible();
    await expect(page.getByRole("row", { name: /Recruiting/ })).toHaveCount(0);
  });

  test("a home time zone must be a real zone, and is stored in its canonical form", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/people/p_bob");
    const zone = page.getByLabel("Home timezone");
    await expect(zone).toHaveAttribute("list", "person-time-zones");

    await zone.fill("Mars/Olympus");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page.getByText("Use an IANA time zone, such as America/Los_Angeles")).toBeVisible();

    await zone.fill("america/new_york");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await page.goto("/directory?person=p_bob");
    await expect(page.getByRole("complementary", { name: "Bob Lindqvist details" })).toContainText(
      "America/New_York",
    );
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
    await expect(page.getByRole("row", { name: /max@example\.com/ })).toContainText("SF-2-014");
    await expect(page.getByRole("row", { name: /bob@example\.com/ })).toContainText("SF-2-010");
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
