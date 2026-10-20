import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const HINT = "PRESS AND HOLD THE LINE TO SEE ANY MOMENT";
/** Longer than the chart's long-press timer, so the drag that follows takes the touch. */
const HOLD_MS = 400;
const SHOTS = "test-results/score-race";

/** The score race's chart overlay, the drag target for the scrub. */
function chartOf(page: Page): Locator {
  return page.getByLabel("Score race for this game");
}

/** Open the seeded tie-break match and bring its score race into view. */
async function gotoScoreRace(page: Page): Promise<Locator> {
  await page.goto("/match/seed-12");
  await expect(page.getByText("DEF. MARTA & LEO")).toBeVisible({ timeout: 90_000 });
  const chart = chartOf(page);
  await chart.scrollIntoViewIfNeeded();
  await expect(chart).toBeVisible();
  await expect(page.getByText(HINT)).toBeVisible();
  return chart;
}

test.describe("score race scrub", () => {
  test("a drag steps through the rallies and shows the readout", async ({ page }) => {
    const chart = await gotoScoreRace(page);
    await page.screenshot({ path: `${SHOTS}/idle.png` });

    const box = await chart.boundingBox();
    if (box === null) {
      throw new Error("score race chart has no bounding box");
    }
    const y = box.y + box.height / 2;
    const readout = page.getByTestId("scrub-readout");

    // Press near the left edge and hold until the long-press timer arms the chart,
    // then drag halfway across: the readout appears.
    await page.mouse.move(box.x + 16, y);
    await page.mouse.down();
    await page.waitForTimeout(HOLD_MS);
    await page.mouse.move(box.x + box.width / 2, y, { steps: 12 });
    await expect(readout).toBeVisible();
    await expect(page.getByText(HINT)).toHaveCount(0);
    await expect(readout.getByText("GAME", { exact: true })).toBeVisible();
    // Heart rate is in the match, so the BPM cell is always there (it is never dropped).
    await expect(readout.getByText("BPM", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/scrub-mid.png` });
    const midText = await readout.textContent();
    if (midText === null) {
      throw new Error("scrub readout has no text");
    }

    // Carry on to the right edge: the rally under the cursor moves on.
    await page.mouse.move(box.x + box.width - 10, y, { steps: 20 });
    await expect(readout).toBeVisible();
    await expect(readout).not.toHaveText(midText);
    const endText = await readout.textContent();
    await page.screenshot({ path: `${SHOTS}/scrub-end.png` });

    // Lifting the finger puts the hint back and clears the cursor.
    await page.mouse.up();
    await expect(readout).toHaveCount(0);
    await expect(page.getByText(HINT)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/released.png` });

    expect(midText).not.toBe(endText);
  });

  test("a vertical swipe scrolls the card instead of scrubbing", async ({ page }) => {
    const chart = await gotoScoreRace(page);
    const box = await chart.boundingBox();
    if (box === null) {
      throw new Error("score race chart has no bounding box");
    }
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(x + 2, box.y + 120, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByTestId("scrub-readout")).toHaveCount(0);
    await expect(page.getByText(HINT)).toBeVisible();
  });

  test("a sideways drag without a hold does not scrub", async ({ page }) => {
    const chart = await gotoScoreRace(page);
    const box = await chart.boundingBox();
    if (box === null) {
      throw new Error("score race chart has no bounding box");
    }
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 16, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, y, { steps: 12 });
    await page.mouse.up();

    await expect(page.getByTestId("scrub-readout")).toHaveCount(0);
    await expect(page.getByText(HINT)).toBeVisible();
  });
});
