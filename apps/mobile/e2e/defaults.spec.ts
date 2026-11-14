import { expect, test } from "@playwright/test";
import { gotoHome, saveLiveMatchIfAsked } from "./helpers.ts";

test.describe("match defaults and draft persistence", () => {
  test("the profile row summarises defaults and opens the editor", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("WIN RATE")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("defaults-row")).toContainText("Padel · Doubles · best of 3");

    await page.getByTestId("defaults-row").click();
    await expect(page.getByText("Changes save instantly")).toBeVisible();

    // Switch the defaults to squash HIHO first-to-9; every tap applies.
    await page.getByRole("button", { name: "Squash", exact: true }).click();
    await page.getByRole("button", { name: "HIHO", exact: true }).click();
    await page.getByRole("button", { name: "9", exact: true }).click();

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("defaults-row")).toContainText("Squash · Singles · best of 3");

    // A new match now prefills from the saved defaults.
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await expect(page.getByText("Singles · Squash scoring")).toBeVisible();
  });

  test("leaving a half-set-up match restores settings and players on return", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await expect(page.getByText("Doubles · FIP scoring")).toBeVisible();

    // Pick the partner and both opponents, then switch sport (in the sheet).
    await page.getByText("Pick a player").first().click();
    await expect(page.getByText("PICK TEAM A")).toBeVisible();
    await page.getByRole("button", { name: /Javi .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();
    await page.getByText("Pick a player").first().click();
    await expect(page.getByText("PICK TEAM B")).toBeVisible();
    await page.getByRole("button", { name: /Marta .* with you/u }).click();
    await page.getByRole("button", { name: /Leo .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();
    await page.getByRole("button", { name: "Edit match rules" }).click();
    await page.getByRole("button", { name: "Squash", exact: true }).click();
    await page.getByRole("button", { name: "Use these rules" }).click();
    await expect(page.getByText("Doubles · Squash scoring")).toBeVisible();

    // Leave without starting — nothing is lost.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();

    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await expect(page.getByText("Doubles · Squash scoring")).toBeVisible();
    await expect(page.getByText("Javi", { exact: true })).toBeVisible();
    await expect(page.getByText("Marta", { exact: true })).toBeVisible();
    await expect(page.getByText("Leo", { exact: true })).toBeVisible();

    // Starting the match clears the draft — the next fresh screen has no picks.
    await page.getByRole("button", { name: "START MATCH" }).click();
    await saveLiveMatchIfAsked(page);
    await expect(page.getByTestId("point-A")).toBeVisible();
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await expect(page.getByText("Pick a player").first()).toBeVisible();
  });
});
