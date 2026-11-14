import { expect, test } from "@playwright/test";
import { expectPoints, gotoHome, pointButton, score, startNewMatch } from "./helpers.ts";

test.describe("pause / resume", () => {
  test("pausing freezes the scoreboard and blocks scoring; resuming restores it", async ({
    page,
  }) => {
    await gotoHome(page);
    await startNewMatch(page);

    // Score a couple of points, then pause.
    await score(page, "A", 2);
    await expectPoints(page, "30", "0");
    await expect(page.getByTestId("live-pill")).toHaveText("Live");

    await page.getByTestId("pause-toggle").click();

    // Paused state: the pill flips and the button offers RESUME.
    await expect(page.getByTestId("live-pill")).toHaveText("Paused");
    await expect(page.getByTestId("pause-toggle")).toHaveText("Resume");
    await expect(page.getByText("Paused — workout paused on your watch too")).toBeVisible();

    // Tapping a team while paused must NOT score.
    await pointButton(page, "A").click();
    await pointButton(page, "B").click();
    await expectPoints(page, "30", "0");

    // Resume: back to live, and scoring works again.
    await page.getByTestId("pause-toggle").click();
    await expect(page.getByTestId("live-pill")).toHaveText("Live");
    await expect(page.getByTestId("pause-toggle")).toHaveText("Pause");

    await score(page, "A", 1);
    await expectPoints(page, "40", "0");
  });
});
