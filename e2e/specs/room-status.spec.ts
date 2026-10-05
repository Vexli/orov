import { expect, test, type Page } from "@playwright/test";
import { roomStatus } from "@orov/db/schema";
import { applyTheme } from "@orov/db/queries/theme";
import { resetE2eDatabase, withE2eDb } from "../support/database";
import { signInAs } from "../support/session";

const fillOf = (page: Page, id: string) =>
  page.locator(`[data-floor-map] #${id}`).evaluate((el) => getComputedStyle(el).fill);
const strokeOf = (page: Page, id: string) =>
  page.locator(`[data-floor-map] #${id}`).evaluate((el) => getComputedStyle(el).stroke);
const WHITE = "rgb(255, 255, 255)";

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

// Rows as the Phase 4 rooms:freebusy worker will write them.
async function seedRoomStatus() {
  await withE2eDb((db) =>
    db.insert(roomStatus).values([
      { spaceId: "sp_boardroom", state: "busy", checkedAt: minutesAgo(1) },
      { spaceId: "sp_huddle_a", state: "free", checkedAt: minutesAgo(1) },
      { spaceId: "sp_phone_1", state: "soon", checkedAt: minutesAgo(1) },
      { spaceId: "sp_workshop", state: "free", checkedAt: minutesAgo(10) },
    ]),
  );
}

// U5's rendering, and the non-color cue from plan.md §6. Polling for fresh status is Phase 4.
test.describe("room status on the map", () => {
  test.beforeEach(async ({ context }) => {
    await resetE2eDatabase();
    await seedRoomStatus();
    await signInAs(context, "bob@example.com");
  });

  test("rooms are filled from the room slots and marked with a shape for each state", async ({
    page,
  }) => {
    await page.goto("/map?loc=sf&floor=2");
    await expect(page.locator("[data-floor-map] #room-boardroom")).toBeVisible();

    // Default theme: busy #b91c1c, free #16a34a, soon #d97706, as the outline and a tint.
    expect(await strokeOf(page, "room-boardroom")).toBe("rgb(185, 28, 28)");
    expect(await strokeOf(page, "room-huddle-a")).toBe("rgb(22, 163, 74)");
    expect(await strokeOf(page, "room-phone-1")).toBe("rgb(217, 119, 6)");
    expect(await fillOf(page, "room-boardroom")).not.toBe(WHITE);

    for (const [room, state, label] of [
      ["room-boardroom", "busy", "Boardroom: Busy now"],
      ["room-huddle-a", "free", "Huddle A: Free now"],
      ["room-phone-1", "soon", "Phone Booth 1: Free now, booked within 15 minutes"],
    ] as const) {
      const cue = page.locator(`[data-room="${room}"]`);
      await expect(cue).toHaveAttribute("data-room-state", state);
      await expect(cue.locator("title")).toHaveText(label);
    }

    // The same status in words, on the card and in the list.
    await page.locator("[data-floor-map] #room-boardroom").click();
    await expect(page.getByRole("complementary", { name: "Boardroom details" })).toContainText(
      "StatusBusy now",
    );
    await page.getByRole("button", { name: "List" }).click();
    await expect(page.getByRole("row", { name: /Huddle A/ })).toContainText("Free now");
  });

  test("a status the worker hasn't refreshed for five minutes shows as stale", async ({ page }) => {
    await page.goto("/map?loc=sf&floor=3");
    await expect(page.locator('[data-room="room-workshop"]')).toHaveAttribute(
      "data-room-state",
      "stale",
    );
    // #6b7280, the stale slot, not the free green the row still holds.
    expect(await strokeOf(page, "room-workshop")).toBe("rgb(107, 114, 128)");
    // Selected, the selection's outline wins over the status.
    await page.locator("[data-floor-map] #room-workshop").click();
    await expect(page.getByRole("complementary", { name: "Workshop details" })).toContainText(
      "Status out of date",
    );
  });

  test("a brand theme recolors room states without touching the drawing", async ({ page }) => {
    await withE2eDb((db) =>
      applyTheme(
        db,
        "jane@example.com",
        { files: [], mapping: { "room.busy": { light: "#7f1d1d" } }, darkMode: false, fonts: [] },
        { overrideContrast: false },
      ),
    );
    await page.goto("/map?loc=sf&floor=2");
    await expect(page.locator("[data-floor-map] #room-boardroom")).toBeVisible();
    expect(await strokeOf(page, "room-boardroom")).toBe("rgb(127, 29, 29)");
  });
});
