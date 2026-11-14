import { expect, test } from "@playwright/test";
import type { gotoHome } from "./helpers.ts";

async function gotoMatches(page: Parameters<typeof gotoHome>[0]): Promise<void> {
  await page.goto("/matches");
  await expect(page.getByText("stored locally")).toBeVisible({ timeout: 90_000 });
}

test.describe("matches tab (design 3e)", () => {
  test("lists the ledger newest first with the live match on top", async ({ page }) => {
    await gotoMatches(page);

    await expect(page.getByText("13 stored locally")).toBeVisible();
    await expect(page.getByText("Live", { exact: true })).toBeVisible();
    await expect(page.getByText("6-4 · 4-3")).toBeVisible();
    // The super tie-break match renders its three-part line.
    await expect(page.getByText("7-5 · 2-6 · 10-7")).toBeVisible();
    await expect(page.getByText("vs Carla & Hugo")).toBeVisible();
  });

  test("filters narrow to won, lost and the top rivals", async ({ page }) => {
    await gotoMatches(page);

    await page.getByRole("button", { name: "Won", exact: true }).click();
    await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
    await expect(page.getByText("4-6 · 6-7")).toHaveCount(0);
    await expect(page.getByText("6-3 · 7-6")).toBeVisible();

    await page.getByRole("button", { name: "Lost", exact: true }).click();
    await expect(page.getByText("4-6 · 6-7")).toBeVisible();
    await expect(page.getByText("6-3 · 7-6")).toHaveCount(0);

    // The most frequent opponents: Marta & Leo.
    await page.getByRole("button", { name: "VS M&L" }).click();
    await expect(page.getByText("vs Marta & Leo").first()).toBeVisible();
    await expect(page.getByText("vs Ana & Pablo")).toHaveCount(0);

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText("vs Ana & Pablo").first()).toBeVisible();
  });

  test("the live row resumes scoring, a finished row opens the overview", async ({ page }) => {
    await gotoMatches(page);

    await page.getByText("6-4 · 4-3").click();
    await expect(page).toHaveURL(/\/live\/seed-live/u);
    await expect(page.getByTestId("point-A")).toHaveText("40");

    await gotoMatches(page);
    await page.getByText("7-5 · 2-6 · 10-7").click();
    await expect(page).toHaveURL(/\/match\/seed-10/u);
    await expect(page.getByText("Super tie-break")).toBeVisible();
  });

  test("the NEW pill opens match setup", async ({ page }) => {
    await gotoMatches(page);
    await page.getByRole("button", { name: "New match", exact: true }).click();
    await expect(page.getByText("Doubles · FIP scoring")).toBeVisible();
  });
});
