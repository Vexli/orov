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
      "bob@example.com,Bob Lindqvist,,Payroll Analyst,US-CA,,(415) 555-0123,2023-01-09,true,max@example.com,SF-2-014,hr;payroll,payroll",
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

  test("a file with a bad row can't be applied until the row is skipped", async ({ page, context }) => {
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

    await page.getByLabel("Skip people line 3").check();
    await expect(page.getByText("Not imported: email is not a valid address")).toBeVisible();
    await expect(page.getByText(/· 1 skipped/)).toBeVisible();
    await page.getByRole("button", { name: /Apply 1 change/ }).click();
    await expect(page.getByText("Imported. 1 created, 0 updated, 0 unchanged, 1 skipped.")).toBeVisible();
  });

  test("skipping the rows with errors also skips the rows that depend on them", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/import");
    const csv = [
      "email,name,home_region,manager_email,teams",
      "lee@example.com,Lee Chen,US,,nope",
      "ama@example.com,Ama Ito,US,lee@example.com,",
      "kim@example.com,Kim Lee,US,,",
      "",
    ].join("\n");
    await page.getByLabel("people CSV file").setInputFiles({
      name: "people.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await expect(page.getByText('unknown team "nope" (import teams first)')).toBeVisible();

    await page.getByRole("button", { name: "Skip all rows with errors" }).click();
    await expect(page.getByLabel("Skip people line 2")).toBeChecked();
    await expect(page.getByLabel("Skip people line 3")).toBeChecked();
    await expect(page.getByText("Not imported: manager lee@example.com is on line 2, which is skipped")).toBeVisible();
    await expect(page.getByLabel("Skip people line 4")).not.toBeChecked();

    // Un-skipping Ama alone isn't allowed to write her with a manager who doesn't exist.
    await page.getByLabel("Skip people line 3").uncheck();
    await expect(page.getByText("manager lee@example.com is on line 2, which is skipped")).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply/ })).toBeDisabled();
    await page.getByLabel("Skip people line 3").check();

    await page.getByRole("button", { name: /Apply 1 change/ }).click();
    await expect(page.getByText("Imported. 1 created, 0 updated, 0 unchanged, 2 skipped.")).toBeVisible();
  });

  test("a file saved by Excel in Windows-1252 keeps its accented names", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/import");
    const csv = [
      "email,name,home_region",
      "jose@example.com,José Müller,ES",
      "zoe@example.com,Zoë Ångström,SE",
      "",
    ].join("\r\n");
    await page.getByLabel("people CSV file").setInputFiles({
      name: "people.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "latin1"),
    });

    await expect(page.getByRole("status", { name: "people file encoding" })).toContainText(
      "Read as Windows-1252",
    );
    await expect(page.getByText("José Müller")).toBeVisible();
    await page.getByRole("button", { name: /Apply 2 change/ }).click();
    await expect(page.getByText("2 created")).toBeVisible();

    await page.goto("/directory?q=zo");
    await expect(page.getByRole("button", { name: /Zoë Ångström/ })).toBeVisible();
  });

  test("Excel's UTF-16 'Unicode Text' (tab-separated) imports too", async ({ page, context }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/import");
    const tsv = "email\tname\thome_region\r\nzoe@example.com\tZoë Ångström\tSE\r\n";
    await page.getByLabel("people CSV file").setInputFiles({
      name: "people.txt",
      mimeType: "text/plain",
      buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tsv, "utf16le")]),
    });
    await expect(page.getByRole("status", { name: "people file encoding" })).toContainText("Read as UTF-16 LE");
    await expect(page.getByText("Zoë Ångström")).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply 1 change/ })).toBeEnabled();
  });
});
