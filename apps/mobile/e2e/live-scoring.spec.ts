import { expect, test } from "@playwright/test";
import {
  expectPoints,
  gotoHome,
  gotoLive,
  pointButton,
  score,
  startNewMatch,
  statusPill,
  winLoveGame,
  winLoveGames,
} from "./helpers.ts";

test.describe("live scoring (design 1a)", () => {
  test("shows the seeded scoreboard: chips, points, serve, game point", async ({ page }) => {
    await gotoLive(page, "seed-live");

    await expect(page.getByTestId("set-chip-set-1")).toHaveText("6–4");
    await expect(page.getByTestId("set-chip-set-2")).toHaveText("4–3");
    await expect(page.getByTestId("set-chip-set-3")).toHaveText("–");
    await expectPoints(page, "40", "30");
    await expect(statusPill(page)).toHaveText("GAME POINT — NICO & JAVI");
    // Game 18 of the match: Marta & Leo serve.
    await expect(page.getByTestId("point-B-serve-on")).toBeVisible();
    await expect(page.getByText("Set 2", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Synced — 2 watches connected")).toBeVisible();
  });

  test("walks the calls 0-15-30-40 and wins the game", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page);

    await score(page, "A", 1);
    await expectPoints(page, "15", "0");
    await score(page, "A", 1);
    await expectPoints(page, "30", "0");
    await score(page, "B", 1);
    await expectPoints(page, "30", "15");
    await score(page, "A", 1);
    await expectPoints(page, "40", "15");
    await expect(statusPill(page)).toHaveText("GAME POINT — NICO & JAVI");
    await score(page, "A", 1);
    await expectPoints(page, "0", "0");
    await expect(page.getByTestId("set-chip-set-1")).toHaveText("1–0");
  });

  test("cycles deuce and advantage until two clear points", async ({ page }) => {
    await gotoLive(page, "seed-live");

    await score(page, "B", 1); // 40-40
    await expect(statusPill(page)).toHaveText("DEUCE");
    await score(page, "A", 1);
    await expect(statusPill(page)).toHaveText("ADVANTAGE — NICO & JAVI");
    await score(page, "B", 1);
    await expect(statusPill(page)).toHaveText("DEUCE");
    await score(page, "B", 1);
    await expect(statusPill(page)).toHaveText("ADVANTAGE — MARTA & LEO");
    await score(page, "B", 1); // game Marta & Leo
    await expectPoints(page, "0", "0");
    await expect(page.getByTestId("set-chip-set-2")).toHaveText("4–4");
  });

  test("rotates the serve to the other pair after a game", async ({ page }) => {
    await gotoLive(page, "seed-live");
    await expect(page.getByTestId("point-B-serve-on")).toBeVisible();
    await score(page, "A", 1); // game
    await expect(page.getByTestId("point-A-serve-on")).toBeVisible();
    await expect(page.getByTestId("point-B-serve-off")).toBeVisible();
  });

  test("undo restores the exact score, including across a game boundary", async ({ page }) => {
    await gotoLive(page, "seed-live");

    await score(page, "A", 1); // game won: 5-3, 0-0
    await expect(page.getByTestId("set-chip-set-2")).toHaveText("5–3");
    await page.getByRole("button", { name: "UNDO" }).click();
    await expect(page.getByTestId("set-chip-set-2")).toHaveText("4–3");
    await expectPoints(page, "40", "30");
    await expect(statusPill(page)).toHaveText("GAME POINT — NICO & JAVI");
  });

  test("undo on a fresh match is a harmless no-op", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page);
    await page.getByRole("button", { name: "UNDO" }).click();
    await expect(page.getByTestId("point-A")).toHaveText("0");
    await expect(page.getByTestId("point-B")).toHaveText("0");
  });

  test("set point and match point labels escalate", async ({ page }) => {
    await gotoLive(page, "seed-live");
    // Take the game (5-3), then three points of the next game: 40-0 at 5-3
    // means winning the game takes the set AND the match (set 1 is banked).
    await score(page, "A", 1);
    await score(page, "A", 3);
    await expect(statusPill(page)).toHaveText("MATCH POINT — NICO & JAVI");
  });

  test("end sheet — keep playing dismisses and scoring continues", async ({ page }) => {
    await gotoLive(page, "seed-live");
    await page.getByRole("button", { name: "End match" }).click();
    await page.getByRole("button", { name: "Keep playing" }).click();
    // Still on the live screen with the same score.
    await expectPoints(page, "40", "30");
    await expect(pointButton(page, "A")).toBeVisible();
  });

  test("end sheet — stop & save keeps the partial result and lands home", async ({ page }) => {
    await gotoLive(page, "seed-live");
    await page.getByRole("button", { name: "End match" }).click();
    await page.getByRole("button", { name: "Stop and save" }).click();
    // Saved (not discarded): back home with no live match left.
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await expect(page.getByText("LIVE NOW")).toHaveCount(0);
  });

  test("a set won 6-4 banks the chip and opens the next set", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page);
    // Alternate games to 4-4, then two straight for A: 6-4.
    for (let i = 0; i < 4; i += 1) {
      await winLoveGame(page, "A");
      await winLoveGame(page, "B");
    }
    await winLoveGames(page, "A", 2);
    await expect(page.getByTestId("set-chip-set-1")).toHaveText("6–4");
    await expect(page.getByTestId("set-chip-set-2")).toHaveText("0–0");
  });
});
