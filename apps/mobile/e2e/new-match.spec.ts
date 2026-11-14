import { expect, test } from "@playwright/test";
import { expectPoints, gotoHome, startNewMatch } from "./helpers.ts";

test.describe("match setup and player picker (designs 1f + 3b)", () => {
  test("shows the setup defaults from the design", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();

    await expect(page.getByText("Doubles · FIP scoring")).toBeVisible();
    await expect(page.getByText("Team A", { exact: true })).toBeVisible();
    await expect(page.getByText("Team B", { exact: true })).toBeVisible();
    await expect(page.getByText("Nico", { exact: true })).toBeVisible();
    // Rules are collapsed into the summary card; the sport and format lead it.
    await expect(page.getByTestId("rules-summary")).toContainText("Padel · Doubles");
    await expect(page.getByTestId("rules-summary")).toContainText("Best of 3");
    await expect(page.getByText("Watches join automatically when the match starts")).toBeVisible();

    // The full rule rows live inside the editor sheet.
    await page.getByRole("button", { name: "Edit match rules" }).click();
    await expect(page.getByText("Sets", { exact: true })).toBeVisible();
    await expect(page.getByText("Last set")).toBeVisible();
    await expect(page.getByText("At deuce")).toBeVisible();
    await expect(page.getByText("First serve")).toBeVisible();
    await page.getByRole("button", { name: "Use these rules" }).click();
    await expect(page.getByText("Sets", { exact: true })).toHaveCount(0);
  });

  test("starting without four players does nothing", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await page.getByRole("button", { name: "START MATCH" }).click();
    // Still on the setup screen.
    await expect(page.getByText("Doubles · FIP scoring")).toBeVisible();
  });

  test("search filters the roster and selection is capped at two", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();

    // Open the team B picker directly (second card).
    await page.getByText("Pick a player").nth(1).click();
    await expect(page.getByText("PICK TEAM B")).toBeVisible();

    await page.getByPlaceholder("Search players…").fill("mar");
    await expect(page.getByRole("button", { name: /Marta .* with you/u })).toBeVisible();
    await expect(page.getByRole("button", { name: /Javi .* with you/u })).toHaveCount(0);
    await page.getByPlaceholder("Search players…").fill("");

    // Pick three: the oldest pick drops, only two stay selected.
    await page.getByRole("button", { name: /Marta .* with you/u }).click();
    await page.getByRole("button", { name: /Leo .* with you/u }).click();
    await page.getByRole("button", { name: /Ana .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();
    await expect(page.getByText("Leo", { exact: true })).toBeVisible();
    await expect(page.getByText("Ana", { exact: true })).toBeVisible();
    await expect(page.getByText("Marta", { exact: true })).toHaveCount(0);
  });

  test("a new player can be created from the sheet and picked", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await page.getByText("Pick a player").first().click();
    await expect(page.getByText("PICK TEAM A")).toBeVisible();

    await page.getByPlaceholder("New player").fill("Zoe");
    await page.getByPlaceholder("New player").press("Enter");
    await expect(page.getByRole("button", { name: /Zoe .* with you/u })).toBeVisible();
    await expect(page.getByText("0 matches with you")).toBeVisible();
    await page.getByRole("button", { name: /Zoe .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();
    await expect(page.getByText("Zoe", { exact: true })).toBeVisible();
  });

  test("first serve Team B puts the serve dot on the opponents", async ({ page }) => {
    await gotoHome(page);
    await startNewMatch(page, { firstServe: "Team B" });
    await expectPoints(page, "0", "0");
    await expect(page.getByTestId("point-B-serve-on")).toBeVisible();
    await expect(page.getByTestId("point-A-serve-off")).toBeVisible();
  });

  test("the backdrop closes the sheet without losing the setup", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await page.getByText("Pick a player").first().click();
    await expect(page.getByText("PICK TEAM A")).toBeVisible();
    // Tap the dimmed area above the sheet.
    await page.getByTestId("picker-backdrop").click({ position: { x: 200, y: 40 } });
    await expect(page.getByText("PICK TEAM A")).toHaveCount(0);
    await expect(page.getByText("Doubles · FIP scoring")).toBeVisible();
  });
});
