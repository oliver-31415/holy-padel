import { expect, test } from "@playwright/test";
import { gotoHome, startNewMatch, winLoveGames } from "./helpers.ts";

async function gotoProfile(page: Parameters<typeof gotoHome>[0]): Promise<void> {
  await page.goto("/profile");
  await expect(page.getByText("WIN RATE")).toBeVisible({ timeout: 90_000 });
}

test.describe("profile tab (design 3f)", () => {
  test("computes the seeded record from the ledger", async ({ page }) => {
    await gotoProfile(page);

    await expect(page.getByText("Nico", { exact: true })).toBeVisible();
    await expect(page.getByText("Club Padel Norte · plays left side")).toBeVisible();

    // 12 finished matches, 8 won: 67%.
    await expect(page.getByText("12", { exact: true })).toBeVisible();
    // The record shows in the tile and again in the by-sport table.
    await expect(page.getByText("8–4", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("67%", { exact: true })).toBeVisible();
    await expect(page.getByText("FORM · LAST 5")).toBeVisible();
    await expect(page.getByText("BEST RUN")).toBeVisible();

    // Partner and rival records moved to the Stats tab.
    await expect(page.getByText("WITH PARTNER")).toHaveCount(0);

    // Sport table pairs the record with lifetime rally points.
    await expect(page.getByText("BY SPORT")).toBeVisible();
    await expect(page.getByText("Points", { exact: true })).toBeVisible();
    await expect(page.getByText("543–502", { exact: true })).toBeVisible();

    // Settings are grouped in one card.
    await expect(page.getByText("SETTINGS")).toBeVisible();
    await expect(page.getByText("Match defaults")).toBeVisible();

    // Storage row counts every stored match, live included.
    await expect(page.getByText(/SQLite · 13 matches · .+ MB/u)).toBeVisible();
  });

  test("updates immediately after a new win", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page, { bestOf: 1 });
    await winLoveGames(page, "A", 6);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();

    // Two new wins: this match, and the seeded live one (Nico & Javi ahead),
    // saved when this match started.
    await gotoProfile(page);
    await expect(page.getByText("14", { exact: true })).toBeVisible();
    await expect(page.getByText("10–4", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("71%", { exact: true })).toBeVisible();
    await expect(page.getByText(/SQLite · 14 matches/u)).toBeVisible();

    // Partner and rival records live on the Stats tab now.
    await page.getByTestId("tab-stats").click();
    await expect(page.getByTestId("partner-javi")).toContainText("10–3");
    await expect(page.getByTestId("rival-marta")).toContainText("6–3");
  });

  test("highlight and Team B colours can be chosen and persist", async ({ page }) => {
    await gotoProfile(page);
    // Defaults: orange highlight, violet Team B.
    await expect(page.getByTestId("accent-orange")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("teamb-violet")).toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: "Pink highlight" }).click();
    await page.getByRole("button", { name: "Teal Team B" }).click();
    await expect(page.getByTestId("accent-pink")).toHaveAttribute("aria-selected", "true");

    await page.reload();
    await expect(page.getByText("WIN RATE")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("accent-pink")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("teamb-teal")).toHaveAttribute("aria-selected", "true");
  });
});
