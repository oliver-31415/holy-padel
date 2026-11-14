import { expect, test } from "@playwright/test";
import { confirmSheet, gotoHome, startNewMatch, winLoveGames } from "./helpers.ts";

async function gotoOverview(
  page: Parameters<typeof confirmSheet>[0],
  id: string,
  marker: string,
): Promise<void> {
  await page.goto(`/match/${id}`);
  await expect(page.getByText(marker)).toBeVisible({ timeout: 90_000 });
}

test.describe("match overview (design 3d)", () => {
  test("shows the hero, set notes and totals for a tie-break win", async ({ page }) => {
    await gotoOverview(page, "seed-12", "DEF. MARTA & LEO");

    // The pair appears in the hero and again as a MATCH TOTALS label.
    await expect(page.getByText("Nico & Javi", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("overview-score")).toHaveText("6-3 · 7-6");
    await expect(page.getByText(/best of 3 · advantage/u)).toBeVisible();

    // Set rows: a break note for set 1, the tie-break score for set 2.
    await expect(page.getByText("Set 1", { exact: true })).toBeVisible();
    await expect(page.getByText(/Break in game \d+/u)).toBeVisible();
    await expect(page.getByText("Tie-break 7–4")).toBeVisible();

    await expect(page.getByText("MATCH TOTALS")).toBeVisible();
    await expect(page.getByText("POINTS WON")).toBeVisible();
    await expect(page.getByText("Longest game")).toBeVisible();
    await expect(page.getByText("Service games held")).toBeVisible();
    await expect(page.getByText("EXPORT")).toBeVisible();
    await expect(page.getByText("DELETE MATCH")).toBeVisible();
  });

  test("labels a super tie-break decider", async ({ page }) => {
    await gotoOverview(page, "seed-10", "Super tie-break");
    await expect(page.getByTestId("overview-score")).toHaveText("7-5 · 2-6 · 10-7");
    await expect(page.getByText("Set 3", { exact: true })).toBeVisible();
  });

  test("edit corrects who played, and the result follows", async ({ page }) => {
    await gotoOverview(page, "seed-12", "DEF. MARTA & LEO");
    await page.getByRole("button", { name: "Edit match" }).click();
    await expect(
      page.getByText("The score and the rallies stay as they were played"),
    ).toBeVisible();

    // Team B was Marta & Leo; it was really Marta & Ana.
    await page.getByText("Leo", { exact: true }).click();
    await expect(page.getByText("PICK TEAM B")).toBeVisible();
    await page.getByRole("button", { name: /Leo .* with you/u }).click();
    await page.getByRole("button", { name: /Ana .* with you/u }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.getByTestId("edit-match-location").fill("Club Río Sur");
    await page.getByTestId("save-match").click();

    // Back on the overview: same score, new opponents.
    await expect(page.getByText("def. Marta & Ana")).toBeVisible();
    await expect(page.getByTestId("overview-score")).toHaveText("6-3 · 7-6");

    // The ledger row and the head-to-head records moved with it.
    await page.goto("/matches");
    await expect(page.getByText("13 stored locally")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole("button").filter({ hasText: "Club Río Sur" })).toHaveCount(1);
    await expect(
      page
        .getByRole("button")
        .filter({ hasText: "vs Marta & Ana" })
        .filter({ hasText: "6-3 · 7-6" }),
    ).toHaveCount(1);
  });

  test("a one-set match is never told as 'set 1'", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page, { bestOf: 1 });
    // The live chip for the only set carries no number either.
    await expect(page.getByText("Set", { exact: true })).toBeVisible();
    await winLoveGames(page, "A", 6);
    await expect(page.getByText("MATCH WON")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await page.goto("/matches");
    await expect(page.getByText("14 stored locally")).toBeVisible({ timeout: 90_000 });
    await page.getByRole("button").filter({ hasText: "6-0" }).first().click();
    await expect(page.getByTestId("overview-score")).toHaveText("6-0");
    await expect(page.getByText("Set", { exact: true })).toBeVisible();
    await expect(page.getByText(/set 1/iu)).toHaveCount(0);
    // The score race names the game alone — there is no set to place it in.
    await expect(page.getByText(/^Game \d+ · \d+–\d+$/u)).toBeVisible();
  });

  test("delete asks first; cancel keeps the match", async ({ page }) => {
    await gotoOverview(page, "seed-12", "DEF. MARTA & LEO");
    await page.getByTestId("delete-match").click();
    await expect(page.getByTestId("confirm-sheet")).toBeVisible();
    await page.getByTestId("confirm-cancel").click();
    await expect(page.getByText("DEF. MARTA & LEO")).toBeVisible();

    await page.goto("/matches");
    await expect(page.getByText("13 stored locally")).toBeVisible();
  });

  test("delete removes the match and its stats everywhere", async ({ page }) => {
    await gotoOverview(page, "seed-12", "DEF. MARTA & LEO");
    await page.getByTestId("delete-match").click();
    await confirmSheet(page);
    await expect(page.getByText("HOLA, NICO")).toBeVisible();

    await page.goto("/matches");
    await expect(page.getByText("12 stored locally")).toBeVisible();
    await expect(page.getByText("6-3 · 7-6")).toHaveCount(0);

    // Profile recomputes: 11 played, 7–4 now.
    await page.goto("/profile");
    await expect(page.getByText("Played", { exact: true })).toBeVisible();
    await expect(page.getByText("7–4", { exact: true }).first()).toBeVisible();
  });
});
