import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

// U10: an admin imports the spreadsheets, then edits people and teams in the app.
test.describe("admin CSV import (U10)", () => {
  test.beforeEach(resetE2eDatabase);

  test("a dry run previews the rows, and applying writes them and the audit log", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/import");

    const csv = [
      "email,name,preferred_name,title,home_region,home_timezone,phone,start_date,active,manager_email,desk,teams,primary_team",
      "bob@example.com,Bob Lindqvist,,Payroll Analyst,US-CA,,,2023-01-09,true,max@example.com,SF-2-014,hr;payroll,payroll",
      "lee@example.com,Lee Chen,,Team Lead,US-NY,,,,,jane@example.com,,hr,hr",
      "ama@example.com,Ama Ito,,Recruiter,US,,,,,lee@example.com,SF-2-016,recruiting,recruiting",
      "",
    ].join("\n");

    await page.getByLabel("people CSV file").setInputFiles({
      name: "people.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    const summary = page.getByText(/to create · .* to update · .* unchanged/);
    await expect(summary).toContainText("2 to create");
    await expect(summary).toContainText("1 unchanged");
    await expect(page.getByRole("button", { name: /Apply 2 change/ })).toBeEnabled();

    // The manager (Lee) is defined later in the file than Ama, and the dry run handles that.
    await page.getByRole("button", { name: /Apply 2 change/ }).click();
    await expect(page.getByRole("status")).toContainText("2 created");

    await page.goto("/admin/audit?entity=person");
    await expect(page.getByRole("row", { name: /ama@|Ama|create/ }).first()).toBeVisible();
    await expect(page.getByText("jane@example.com").first()).toBeVisible();
  });

  test("a file with a bad row shows the error and enables nothing", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/import");

    const csv = [
      "email,name,preferred_name,title,home_region,home_timezone,phone,start_date,active,manager_email,desk,teams,primary_team",
      "good@example.com,Good Person,,,US,,,,,,,,",
      "not-an-email,Bad Row,,,US,,,,,,,,",
      "",
    ].join("\n");

    await page.getByLabel("people CSV file").setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });

    await expect(page.getByText("email is not a valid address")).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply/ })).toBeDisabled();
  });
});
