import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

test.describe("audit log", () => {
  test.beforeEach(resetE2eDatabase);

  test("an admin filters the log and downloads the same entries as CSV, and the download is logged", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    // One person change and one team change to filter between.
    await page.goto("/admin/people/p_bob");
    await page.getByLabel("Title").fill("Senior Payroll Analyst");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await page.goto("/admin/teams/t_payroll");
    await page.getByLabel("Name").fill("Payroll & Benefits");
    await page.getByRole("button", { name: /Save team/ }).click();
    await expect(page).toHaveURL(/\/admin\/teams$/);

    await page.goto("/admin/audit");
    await page.getByLabel("Entity").selectOption("person");
    await page.getByLabel("Who").fill("jane");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(/entity=person/);
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('title: "Payroll Analyst" → "Senior Payroll Analyst"');

    const exportLink = page.getByRole("link", { name: "Export CSV" });
    await expect(exportLink).toHaveAttribute("href", "/api/export/audit?entity=person&actor=jane");
    const [download] = await Promise.all([page.waitForEvent("download"), exportLink.click()]);
    expect(download.suggestedFilename()).toBe("audit-log.csv");
    const lines = (await readFile((await download.path())!, "utf8")).trim().split("\n");
    expect(lines[0]).toBe("at,actor_email,entity,entity_id,action,changed_fields,before,after");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z,jane@example\.com,person,p_bob,update,title,/);

    await page.goto("/admin/audit?entity=audit_log");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("export");
    await expect(rows.first()).toContainText("rows: null → 1");
    await expect(rows.first()).toContainText('filters: null → {"actor":"jane","entity":"person"}');
  });

  test("a viewer can't export the log", async ({ page, context }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/admin/audit");
    expect((await page.request.get("/api/export/audit")).status()).toBe(403);
  });
});
