import { expect, type Page, test } from "@playwright/test";

async function gotoProfile(page: Page): Promise<void> {
  await page.goto("/profile");
  await expect(page.getByText("WIN RATE")).toBeVisible({ timeout: 90_000 });
}

test.describe("player profiles", () => {
  test("the players card lists the roster and opens a profile", async ({ page }) => {
    await gotoProfile(page);
    await expect(page.getByText("Players", { exact: true })).toBeVisible();
    await expect(page.getByTestId("player-javi")).toContainText("matches with you");

    await page.getByTestId("player-javi").click();
    await expect(page.getByText("Javi", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("Club Padel Norte · plays right side")).toBeVisible();
    // The profile tab stays mounted (hidden) behind the player route.
    await expect(page.getByText("Played", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("With you", { exact: true })).toBeVisible();
    await expect(page.getByText("Matches with you", { exact: true })).toBeVisible();
  });

  test("a partner row on the Stats tab opens that player's profile", async ({ page }) => {
    await page.goto("/stats");
    await expect(page.getByText("PARTNERS & RIVALS")).toBeVisible({ timeout: 90_000 });
    await page.getByTestId("partner-javi").click();
    await expect(page.getByText("Javi", { exact: true }).last()).toBeVisible();
    // Javi partners the owner in the seed but never opposes him, so the
    // profile shows the together card rather than a "vs you" row.
    await expect(page.getByText("Matches with you", { exact: true })).toBeVisible();
  });

  test("editing a player updates name and side", async ({ page }) => {
    await gotoProfile(page);
    await page.getByTestId("player-javi").click();
    await page.getByTestId("edit-player").click();
    await expect(page.getByText("EDIT PLAYER")).toBeVisible();

    await page.getByTestId("edit-name").fill("Javier");
    await page.getByTestId("side-left").click();
    await page.getByTestId("save-profile").click();

    await expect(page.getByText("Javier", { exact: true }).last()).toBeVisible();
    // The edit screen stays mounted (hidden) behind the player profile.
    await expect(page.getByText("Club Padel Norte · plays left side").last()).toBeVisible();
  });

  test("a player added from the players card lands on their new profile", async ({ page }) => {
    await gotoProfile(page);
    await page.getByPlaceholder("New player").fill("Cameron");
    await page.getByPlaceholder("New player").press("Enter");

    await expect(page.getByText("Cameron", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("No matches partnering you yet")).toBeVisible();
  });

  test("deleting a player with matches offers keep-matches or delete-all", async ({ page }) => {
    await gotoProfile(page);
    await page.getByTestId("player-javi").click();
    await page.getByTestId("edit-player").click();
    await page.getByTestId("delete-player").click();

    await expect(page.getByText("Javi is in 12 matches on this phone.")).toBeVisible();
    await page.getByTestId("delete-keep-matches").click();

    // The player screen recovers home once the profile is gone…
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await gotoProfile(page);
    // …the roster no longer lists Javi…
    await expect(page.getByTestId("player-javi")).toHaveCount(0);
    // …and the match history survived the deletion.
    await expect(page.getByText(/SQLite · 13 matches/u)).toBeVisible();
    await page.goto("/stats");
    await expect(page.getByText("Former player", { exact: true }).first()).toBeVisible({
      timeout: 90_000,
    });
  });

  test("deleting a player with matches can remove the matches too", async ({ page }) => {
    await gotoProfile(page);
    await page.getByTestId("player-javi").click();
    await page.getByTestId("edit-player").click();
    await page.getByTestId("delete-player").click();
    await page.getByTestId("delete-with-matches").click();

    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await gotoProfile(page);
    // Javi was in 12 of the 13 stored matches; seed-07 (partnered with Ana)
    // never featured him, so exactly that one match survives.
    await expect(page.getByText(/SQLite · 1 matches/u)).toBeVisible();
  });

  test("deleting a player without matches is a single confirm", async ({ page }) => {
    await gotoProfile(page);
    await page.getByPlaceholder("New player").fill("Cameron");
    await page.getByPlaceholder("New player").press("Enter");
    await expect(page.getByText("Cameron", { exact: true }).last()).toBeVisible();

    await page.getByTestId("edit-player").click();
    await page.getByTestId("delete-player").click();
    await expect(page.getByText("This removes the profile from this phone.")).toBeVisible();
    await page.getByTestId("delete-player-confirm").click();

    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await gotoProfile(page);
    await expect(page.getByText("Cameron", { exact: true })).toHaveCount(0);
  });
});
