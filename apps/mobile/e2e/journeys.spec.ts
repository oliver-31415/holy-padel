import { expect, test } from "@playwright/test";
import {
  confirmSheet,
  expectPoints,
  gotoHome,
  gotoLive,
  score,
  startNewMatch,
  winLoveGames,
} from "./helpers.ts";

test.describe("multi-match journeys", () => {
  test("a rematch chain persists every result", async ({ page }) => {
    // Regression guard: every match in a REMATCH chain is saved, even though
    // the route param changes without remounting the screen.
    await gotoHome(page);
    await startNewMatch(page, { bestOf: 1 });
    await winLoveGames(page, "A", 6);
    await expect(page.getByText("MATCH WON")).toBeVisible();

    await page.getByRole("button", { name: "Rematch", exact: true }).click();
    await expectPoints(page, "0", "0");
    await winLoveGames(page, "B", 6);
    await expect(page.getByText("MATCH LOST")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();

    // Both new matches are finished, and the seeded live match was saved
    // (Nico & Javi ahead) when the first one started — nothing is left live.
    await page.goto("/matches");
    await expect(page.getByText("15 stored locally")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Live", { exact: true })).toHaveCount(0);

    // Profile counted the saved seed match and the chain's win, plus one loss.
    await page.goto("/profile");
    await expect(page.getByText("10–5", { exact: true }).first()).toBeVisible();
  });

  test("starting a match while one is live saves the old one first", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page); // confirms "SAVE & START NEW" for seed-live
    await score(page, "B", 2);
    await expectPoints(page, "0", "30");

    // Only the new match is live — the seeded one wasn't left orphaned.
    await page.goto("/matches");
    await expect(page.getByText("stored locally")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Live", { exact: true })).toHaveCount(1);

    // Home tracks the new match.
    await page.goto("/");
    await expect(page.getByTestId("home-point-A")).toHaveText("0", { timeout: 90_000 });
    await expect(page.getByTestId("home-point-B")).toHaveText("30");
    await expect(page.getByTestId("home-score-line")).toHaveText("0-0");
  });

  test("a match started and left straight away shows on home at once", async ({ page }) => {
    // Regression: home's live-card snapshot query was cached for the new DB
    // version with the previous render's (old) live match, so leaving a just-
    // started match showed the old score — or no card — until another write.
    await gotoHome(page);
    await startNewMatch(page); // saves the seeded live match, starts a fresh one
    await page.goBack();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await expect(page.getByTestId("home-point-A")).toHaveText("0");
    await expect(page.getByTestId("home-point-B")).toHaveText("0");
    await expect(page.getByTestId("home-score-line")).toHaveText("0-0");
  });

  test("a mis-tapped match point can be undone from the result screen", async ({ page }) => {
    await gotoLive(page, "seed-live");
    await score(page, "A", 1); // game -> 5-3
    await winLoveGames(page, "A", 1); // 6-3: match
    await expect(page.getByText("MATCH WON")).toBeVisible();

    await page.getByRole("button", { name: "Undo last point" }).click();
    await expectPoints(page, "40", "0");
    await expect(page.getByTestId("set-chip-set-2")).toHaveText("5–3");

    // Back in play: the match is live again, not saved as a win.
    await page.goto("/matches");
    await expect(page.getByText("stored locally")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Live", { exact: true })).toHaveCount(1);
  });

  test("the result is saved even without pressing DONE", async ({ page }) => {
    await gotoLive(page, "seed-live");
    await score(page, "A", 1);
    await winLoveGames(page, "A", 1);
    await expect(page.getByText("MATCH WON")).toBeVisible();

    // Leave by URL instead of the button: the ledger must already be final.
    await page.goto("/matches");
    await expect(page.getByText("stored locally")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
    await expect(page.getByText("6-4 · 6-3")).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await expect(page.getByText("LIVE NOW")).toHaveCount(0);
  });

  test("deleting a match while viewing it recovers, and stale ids redirect home", async ({
    page,
  }) => {
    await page.goto("/match/seed-12");
    await expect(page.getByText("DEF. MARTA & LEO")).toBeVisible({ timeout: 90_000 });
    await page.getByTestId("delete-match").click();
    await confirmSheet(page);
    await expect(page.getByText("HOLA, NICO")).toBeVisible();

    // Returning to the deleted id must not leave a blank screen.
    await page.goto("/match/seed-12");
    await expect(page.getByText("HOLA, NICO").filter({ visible: true })).toBeVisible({
      timeout: 90_000,
    });
    await page.goto("/live/never-existed");
    await expect(page.getByText("HOLA, NICO").filter({ visible: true })).toBeVisible({
      timeout: 90_000,
    });
  });

  test("the overview of a live match redirects to the scoreboard", async ({ page }) => {
    await page.goto("/match/seed-live");
    await expect(page.getByTestId("point-A")).toBeVisible({ timeout: 90_000 });
    await expect(page).toHaveURL(/\/live\/seed-live/u);
    await expect(page.getByText("DEF.")).toHaveCount(0);
  });

  test("home shows tie-break points while a super tie-break is live", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page, { thirdSet: "Super TB" });
    await winLoveGames(page, "A", 6);
    await winLoveGames(page, "B", 6);
    await score(page, "A", 3);
    await score(page, "B", 1);

    await page.goto("/");
    await expect(page.getByText("HOLA, NICO")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("home-score-line")).toHaveText("6-0 · 0-6 · 3-1");
    // Numeric calls, not 15/30/40.
    await expect(page.getByTestId("home-point-A")).toHaveText("3");
    await expect(page.getByTestId("home-point-B")).toHaveText("1");
  });

  test("undo across a set boundary reverts the banked chip", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page);
    for (let i = 0; i < 4; i += 1) {
      await winLoveGames(page, "A", 1);
      await winLoveGames(page, "B", 1);
    }
    await winLoveGames(page, "A", 2); // set 1: 6-4
    await expect(page.getByTestId("set-chip-set-1")).toHaveText("6–4");
    await expect(page.getByTestId("set-chip-set-2")).toHaveText("0–0");

    await page.getByRole("button", { name: "UNDO" }).click();
    await expect(page.getByTestId("set-chip-set-1")).toHaveText("5–4");
    await expect(page.getByTestId("set-chip-set-2")).toHaveText("–");
    await expect(page.getByTestId("point-A")).toHaveText("40");
  });
});
