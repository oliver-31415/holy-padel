import { expect, test } from "@playwright/test";
import {
  expectPoints,
  gotoHome,
  score,
  startNewMatch,
  statusPill,
  winLoveGames,
} from "./helpers.ts";

test.describe("a full match, start to save", () => {
  test("best-of-1 with golden point: won 6-0, saved, ledger updated", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page, { bestOf: 1, deuce: "Golden pt" });

    // Single set: only one chip.
    await expect(page.getByTestId("set-chip-set-1")).toBeVisible();
    await expect(page.getByTestId("set-chip-set-2")).toHaveCount(0);

    await winLoveGames(page, "A", 5);
    await score(page, "A", 3);
    // 40-0 at 5-0 in a best-of-1: winning the game wins the match.
    await expect(statusPill(page)).toHaveText("MATCH POINT — NICO & JAVI");
    await score(page, "A", 1);

    // Match won screen (design 3c) with computed stats.
    await expect(page.getByText("MATCH WON")).toBeVisible();
    await expect(page.getByText("Nico & Javi", { exact: true })).toBeVisible();
    await expect(page.getByText("DEF. MARTA & LEO")).toBeVisible();
    await expect(page.getByTestId("won-score")).toHaveText("6-0");
    await expect(page.getByText("GAMES")).toBeVisible();
    await expect(page.getByText("24–0")).toBeVisible(); // points tile
    await expect(page.getByText("Saved to this phone · watches updated")).toBeVisible();

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();

    // The ledger picked it up: matches tab count went from 13 to 14.
    await page.getByRole("link", { name: "MATCHES" }).click();
    await expect(page.getByText("14 stored locally")).toBeVisible();
    // The new result is in the ledger (rows carry the club as metadata).
    await expect(
      page
        .getByRole("button")
        .filter({ hasText: /Club Padel Norte/u })
        .filter({ hasText: "6-0" }),
    ).toHaveCount(1);
  });

  test("golden point decides the game at the first deuce", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page, { deuce: "Golden pt" });

    await score(page, "A", 3);
    await score(page, "B", 3);
    await expect(statusPill(page)).toHaveText("GOLDEN POINT");
    await score(page, "B", 1);
    await expectPoints(page, "0", "0");
    await expect(page.getByTestId("set-chip-set-1")).toHaveText("0–1");
  });

  test("rematch from the match-won screen starts the same lineup again", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page, { bestOf: 1 });
    await winLoveGames(page, "A", 6);
    await expect(page.getByText("MATCH WON")).toBeVisible();

    await page.getByRole("button", { name: "Rematch", exact: true }).click();
    await expectPoints(page, "0", "0");
    await expect(page.getByRole("button", { name: "Point Marta & Leo" })).toBeVisible();

    // Both matches exist: the finished one and the fresh live one.
    await page.goto("/matches");
    await expect(page.getByText("stored locally")).toBeVisible({ timeout: 90_000 });
    // Only the rematch is live: the seeded match was saved when this one began.
    await expect(page.getByText("Live", { exact: true })).toHaveCount(1);
  });

  test("a lost match saves as a loss", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page, { bestOf: 1 });
    await winLoveGames(page, "B", 6);
    // The owner's side lost — the headline says so, the winner is credited.
    await expect(page.getByText("MATCH LOST")).toBeVisible();
    await expect(page.getByText("Marta & Leo", { exact: true })).toBeVisible();
    await expect(page.getByText("DEF. NICO & JAVI")).toBeVisible();
    await expect(page.getByTestId("won-score")).toHaveText("0-6");
  });
});
