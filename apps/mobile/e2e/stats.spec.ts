import { expect, type Page, test } from "@playwright/test";

async function gotoStats(page: Page): Promise<void> {
  await page.goto("/stats");
  await expect(page.getByText("UNDER PRESSURE")).toBeVisible({ timeout: 90_000 });
}

test.describe("stats tab", () => {
  test("is reachable from the tab bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("HOLA, NICO")).toBeVisible({ timeout: 90_000 });
    await page.getByTestId("tab-stats").click();
    await expect(page.getByText("UNDER PRESSURE")).toBeVisible();
  });

  test("orders big points, then rallies, then people, then effort", async ({ page }) => {
    await gotoStats(page);
    const titles = [
      "Under pressure",
      "Long or short rallies",
      "Partners & rivals",
      "Effort vs results",
      "Trends",
    ];
    const tops: number[] = [];
    for (const title of titles) {
      const box = await page.getByText(title, { exact: true }).boundingBox();
      tops.push(box?.y ?? -1);
    }
    expect(tops).toEqual([...tops].sort((left, right) => left - right));
    await expect(page.getByTestId("clutch-closing")).toContainText(/\d+%/u);
    await expect(page.getByTestId("clutch-saving")).toContainText("When they're a point away");
    await expect(page.getByTestId("clutch-card")).toContainText("of all points");
    await expect(page.getByTestId("rallies-long")).toContainText(/Over \d+s/u);
    await expect(page.getByTestId("rallies-card")).toContainText(
      "Timed from one point to the next",
    );
  });

  test("lists partners and rivals with their records", async ({ page }) => {
    await gotoStats(page);
    await expect(page.getByTestId("partner-javi")).toContainText("8–3");
    await expect(page.getByTestId("partner-ana")).toContainText("0–1");
    await expect(page.getByTestId("rival-marta")).toContainText("4–3");
    await expect(page.getByText("BEST WITH")).toBeVisible();

    await page.getByRole("button", { name: /Show all/u }).click();
    await expect(page.getByRole("button", { name: "SHOW LESS" })).toBeVisible();
  });

  test("compares effort with results and shows the watch trend", async ({ page }) => {
    await gotoStats(page);
    await expect(page.getByTestId("effort-card")).toContainText("bpm and up");
    await expect(page.getByTestId("trend-card")).toContainText("Last 4 tracked");
    await page.getByTestId("trend-steps").click();
    await expect(page.getByTestId("trend-steps")).toHaveAttribute("aria-selected", "true");
  });

  test("max heart rate can be set and sticks", async ({ page }) => {
    await gotoStats(page);
    const zones = page.getByTestId("zones-card");
    await expect(zones).toContainText("Estimated from your highest reading");
    const before = Number(
      (await zones.getByText(/^Max heart rate \d+$/u).textContent())?.split(" ").at(-1),
    );

    await page.getByRole("button", { name: "Raise max heart rate" }).click();

    await expect(zones).toContainText(`Max heart rate ${String(before + 1)}`);
    await expect(zones).toContainText("Set by you");
    await page.reload();
    await expect(page.getByTestId("zones-card")).toContainText(
      `Max heart rate ${String(before + 1)}`,
    );
  });
});

test.describe("match page insights", () => {
  test("shows key moments and effort by game for a tracked match", async ({ page }) => {
    await page.goto("/match/seed-12");
    await expect(page.getByTestId("key-moments")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("key-moments")).toContainText("break points");
    await expect(page.getByTestId("effort-strip")).toContainText("Hardest");
    await expect(page.getByTestId("match-zones")).toContainText("Mostly");
  });

  test("times the match's rallies and splits them long and short", async ({ page }) => {
    await page.goto("/match/seed-01");
    const rallies = page.getByTestId("match-rallies");
    await expect(rallies).toBeVisible({ timeout: 90_000 });
    await expect(rallies).toContainText("Longest");
    await expect(rallies.getByTestId("rally-strip")).toBeVisible();
    await expect(rallies.getByTestId("rallies-short")).toContainText(/\d+s or less/u);
  });
});
