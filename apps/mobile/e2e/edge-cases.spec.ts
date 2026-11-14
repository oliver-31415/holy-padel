import { expect, test } from "@playwright/test";
import {
  confirmSheet,
  gotoHome,
  gotoLive,
  saveLiveMatchIfAsked,
  score,
  winLoveGames,
} from "./helpers.ts";

test.describe("input edges", () => {
  test("a player picked for one team disappears from the other picker", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();

    await page.getByText("Pick a player").first().click();
    await expect(page.getByText("PICK TEAM A")).toBeVisible();
    await page.getByRole("button", { name: /Javi .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();

    await page.getByText("Pick a player").first().click();
    await expect(page.getByText("PICK TEAM B")).toBeVisible();
    await expect(page.getByRole("button", { name: /Javi .* with you/u })).toHaveCount(0);
    await page.getByRole("button", { name: /Marta .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();

    // And the reverse: Marta is now taken from team A's perspective.
    await page.getByText("Javi", { exact: true }).click();
    await expect(page.getByText("PICK TEAM A")).toBeVisible();
    await expect(page.getByRole("button", { name: /Marta .* with you/u })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Ana .* with you/u })).toBeVisible();
  });

  test("double-tapping the start confirmation creates exactly one match", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await page.getByText("Pick a player").first().click();
    await page.getByRole("button", { name: /Javi .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();
    await page.getByText("Pick a player").first().click();
    await page.getByRole("button", { name: /Marta .* with you/u }).click();
    await page.getByRole("button", { name: /Leo .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();

    // The seeded match is still live, so starting asks to save it first.
    await page.getByRole("button", { name: "START MATCH" }).click();
    await page.getByRole("button", { name: "SAVE & START NEW" }).dblclick();
    await expect(page.getByTestId("point-A")).toBeVisible();

    await page.goto("/matches");
    await expect(page.getByText("14 stored locally")).toBeVisible({ timeout: 90_000 });
    // The seeded match was saved, not orphaned: only the new one is live.
    await expect(page.getByText("Live", { exact: true })).toHaveCount(1);
  });

  test("a tap racing the final point cannot poison the match", async ({ page }) => {
    await gotoLive(page, "seed-live");
    await score(page, "A", 1);
    await winLoveGames(page, "A", 1);
    await expect(page.getByText("MATCH WON")).toBeVisible();

    // The app survives a reload — no stray event broke the replay.
    await page.reload();
    await expect(page.getByText("MATCH WON")).toBeVisible({ timeout: 90_000 });
    await page.goto("/");
    await expect(page.getByText("HOLA, NICO")).toBeVisible();
  });

  test("a match staffed entirely by new players plays through", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();

    await page.getByText("Pick a player").first().click();
    await page.getByPlaceholder("New player").fill("Rita");
    await page.getByPlaceholder("New player").press("Enter");
    await page.getByRole("button", { name: /Rita .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();

    await page.getByText("Pick a player").first().click();
    await page.getByPlaceholder("New player").fill("Sam");
    await page.getByPlaceholder("New player").press("Enter");
    await page.getByPlaceholder("New player").fill("Tess");
    await page.getByPlaceholder("New player").press("Enter");
    await page.getByRole("button", { name: /Sam .* with you/u }).click();
    await page.getByRole("button", { name: /Tess .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();

    await page.getByRole("button", { name: "START MATCH" }).click();
    await saveLiveMatchIfAsked(page);
    await expect(page.getByRole("button", { name: "Point Nico & Rita" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Point Sam & Tess" })).toBeVisible();

    await page.getByRole("button", { name: "Point Nico & Rita" }).click();
    await expect(page.getByTestId("point-A")).toHaveText("15");
  });

  test("creating a player while a search filter is active still shows them", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await page.getByText("Pick a player").first().click();

    await page.getByPlaceholder("Search players…").fill("zzz");
    await expect(page.getByRole("button", { name: /Javi .* with you/u })).toHaveCount(0);
    await page.getByPlaceholder("New player").fill("Bob");
    await page.getByPlaceholder("New player").press("Enter");
    // The filter clears so the creation is visible immediately.
    await expect(page.getByRole("button", { name: /Bob .* with you/u })).toBeVisible();
    await expect(page.getByRole("button", { name: /Javi .* with you/u })).toBeVisible();
  });

  test("blank and whitespace player names are rejected", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();
    await page.getByText("Pick a player").first().click();
    await expect(page.getByText("PICK TEAM A")).toBeVisible();

    const rosterRows = page.getByText(/matches? with you/u);
    const before = await rosterRows.count();
    await page.getByPlaceholder("New player").press("Enter");
    await page.getByPlaceholder("New player").fill("   ");
    await page.getByPlaceholder("New player").press("Enter");
    await expect(rosterRows).toHaveCount(before);
  });

  test("the team A partner slot swaps and deselects", async ({ page }) => {
    await gotoHome(page);
    await page.getByRole("button", { name: "NEW MATCH" }).click();

    await page.getByText("Pick a player").first().click();
    await page.getByRole("button", { name: /Javi .* with you/u }).click();
    await page.getByRole("button", { name: /Ana .* with you/u }).click();
    await page.getByRole("button", { name: "DONE" }).click();
    await expect(page.getByText("Ana", { exact: true })).toBeVisible();
    await expect(page.getByText("Javi", { exact: true })).toHaveCount(0);

    await page.getByText("Ana", { exact: true }).click();
    await page.getByRole("button", { name: /Ana .* with you/u }).click(); // deselect
    await page.getByRole("button", { name: "DONE" }).click();
    await expect(page.getByText("Pick a player")).toHaveCount(3);
  });
});

test.describe("empty ledger", () => {
  test("deleting everything leaves sane zero states and never reseeds", async ({ page }) => {
    test.setTimeout(300_000);
    await gotoHome(page);

    // Discard the live match, delete all twelve finished ones.
    await page.getByRole("button", { name: "RESUME SCORING" }).click();
    await expect(page.getByTestId("point-A")).toBeVisible();
    await page.getByRole("button", { name: "End match" }).click();
    await page.getByRole("button", { name: "Discard match" }).click();
    await expect(page.getByText("HOLA, NICO")).toBeVisible();

    for (let index = 1; index <= 12; index += 1) {
      const id = `seed-${String(index).padStart(2, "0")}`;
      await page.goto(`/match/${id}`);
      await expect(page.getByText("MATCH TOTALS")).toBeVisible();
      await page.getByTestId("delete-match").click();
      await confirmSheet(page);
      await expect(page.getByText("HOLA, NICO")).toBeVisible();
    }

    // Home: no live card, no rematch target, empty form.
    await expect(page.getByText("LIVE NOW")).toHaveCount(0);
    await expect(page.getByText("no matches yet")).toBeVisible();
    await expect(page.getByText("0–0", { exact: true })).toBeVisible();

    // Matches and profile zero states.
    await page.goto("/matches");
    await expect(page.getByText("0 stored locally")).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByText("0%", { exact: true })).toBeVisible();
    await expect(page.getByText(/SQLite · 0 matches/u)).toBeVisible();

    // A reload must NOT resurrect the demo ledger — the roster still exists.
    await page.goto("/matches");
    await page.reload();
    await expect(page.getByText("0 stored locally")).toBeVisible({ timeout: 90_000 });
  });
});
