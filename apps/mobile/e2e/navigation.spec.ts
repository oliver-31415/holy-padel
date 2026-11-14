import { expect, test } from "@playwright/test";
import { gotoHome, gotoLive, score, winLoveGames } from "./helpers.ts";

test.describe("navigation regressions", () => {
  test("save & close works after a page reload straight into the live screen", async ({ page }) => {
    // Regression: POP_TO_TOP crash — the live screen was the only route on the
    // stack after a deep link/reload, and dismissAll had nothing to pop.
    await gotoLive(page, "seed-live");

    // Finish the match: one point takes the game (40-30), one love game the set.
    await score(page, "A", 1);
    await winLoveGames(page, "A", 1);
    await expect(page.getByText("MATCH WON")).toBeVisible();

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    // The error toast must not appear.
    await expect(page.getByText(/POP_TO_TOP/u)).toHaveCount(0);
    // The live card is gone — no more live match.
    await expect(page.getByText("LIVE NOW")).toHaveCount(0);
  });

  test("discarding a match from a deep link lands on home", async ({ page }) => {
    await gotoLive(page, "seed-live");
    await page.getByRole("button", { name: "End match" }).click();
    await page.getByRole("button", { name: "Discard match" }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await expect(page.getByText(/POP_TO_TOP/u)).toHaveCount(0);
    await expect(page.getByText("LIVE NOW")).toHaveCount(0);
  });

  test("overview back button works after a reload straight into the overview", async ({ page }) => {
    await page.goto("/match/seed-12");
    await expect(page.getByText("DEF. MARTA & LEO")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await expect(page.getByText(/POP_TO_TOP|GO_BACK/u)).toHaveCount(0);
  });

  test("a reload during a live match resumes the exact score", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "RESUME SCORING" }).click();
    await expect(page.getByTestId("point-A")).toHaveText("40");
    await score(page, "B", 1); // 40-40 deuce
    await expect(page.getByTestId("point-B")).toHaveText("40");

    await page.reload();
    await expect(page.getByTestId("point-A")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("point-A")).toHaveText("40");
    await expect(page.getByTestId("point-B")).toHaveText("40");
    await expect(page.getByTestId("status-pill")).toHaveText("DEUCE");
  });

  test("save & close returns home through the normal push flow too", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "RESUME SCORING" }).click();
    await score(page, "A", 1);
    await winLoveGames(page, "A", 1);
    await expect(page.getByText("MATCH WON")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
    await expect(page.getByText(/POP_TO_TOP/u)).toHaveCount(0);
  });
});
