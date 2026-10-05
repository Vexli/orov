import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { resetE2eDatabase } from "../support/database";
import { signInAs } from "../support/session";

const PASSPHRASE = "orange kettle submarine";

// #29: the organization as one encrypted file, for backups and moving between instances.
test.describe("backup", () => {
  test.beforeEach(resetE2eDatabase);

  test("an export can restore a change, and the file can't be read without its passphrase", async ({
    page,
    context,
  }) => {
    await signInAs(context, "jane@example.com");
    await page.goto("/admin/backup");
    const exportSection = page.getByRole("region", { name: "Export" });
    await exportSection.getByLabel("Passphrase", { exact: true }).fill(PASSPHRASE);
    await exportSection.getByLabel("The passphrase again").fill(PASSPHRASE);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      exportSection.getByRole("button", { name: "Download encrypted file" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^orov-export-\d{4}-\d\d-\d\d\.json$/);
    const file = await readFile((await download.path())!, "utf8");
    expect(JSON.parse(file)).toMatchObject({ format: "orov-export", version: 1, cipher: { name: "AES-256-GCM" } });
    expect(file).not.toContain("Lindqvist");

    // Change Bob's title, then load the backup to put it back.
    await page.goto("/admin/people/p_bob");
    await page.getByLabel("Title").fill("Changed");
    await page.getByRole("button", { name: "Save person" }).click();
    await expect(page).toHaveURL(/\/admin\/people$/);

    await page.goto("/admin/backup");
    const importSection = page.getByRole("region", { name: "Import" });
    await importSection.getByLabel("Export file").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(file),
    });
    await importSection.getByLabel("Its passphrase").fill("not the passphrase");
    await importSection.getByRole("button", { name: "Preview" }).click();
    await expect(importSection.getByRole("alert")).toHaveText("The passphrase is wrong, or the file has been changed.");

    await importSection.getByLabel("Its passphrase").fill(PASSPHRASE);
    await importSection.getByRole("button", { name: "Preview" }).click();
    const people = importSection.getByRole("table", { name: "What the import would change" }).getByRole("row", { name: /^people/ });
    await expect(people).toHaveText(/people\s*0\s*1\s*4/);
    await importSection.getByRole("button", { name: "Merge and import" }).click();
    await expect(importSection.getByRole("status")).toContainText("Imported.");

    await page.goto("/admin/people");
    await expect(page.getByRole("row", { name: /bob@example\.com/ })).toContainText("Payroll Analyst");
  });

  test("viewers can't export or import", async ({ page, context }) => {
    await signInAs(context, "bob@example.com");
    await page.goto("/directory");
    const exported = await page.request.post("/api/admin/backup/export", { data: { passphrase: PASSPHRASE } });
    expect(exported.status()).toBe(403);
    const imported = await page.request.post("/api/admin/backup/import", { data: { file: "{}", passphrase: PASSPHRASE } });
    expect(imported.status()).toBe(403);
  });
});
