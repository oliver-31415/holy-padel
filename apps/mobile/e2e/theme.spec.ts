import { expect, test } from "@playwright/test";

/**
 * The Appearance control on Profile: selecting a theme applies immediately,
 * persists across reloads, and "System" follows the OS scheme live.
 */
test.describe("theme selection (profile appearance)", () => {
  test("dark, light and system all apply and persist", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("WIN RATE")).toBeVisible({ timeout: 90_000 });

    // The profile title uses the palette's text color: near-black in light
    // mode, near-white in dark mode — a stable read of the active theme.
    const titleColor = (): Promise<string> =>
      page
        .getByText("Nico", { exact: true })
        .first()
        .evaluate((el) => getComputedStyle(el).color);

    // Defaults to System, and the emulated OS is light.
    await expect.poll(titleColor).toBe("rgb(31, 26, 25)");

    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect.poll(titleColor).toBe("rgb(235, 224, 221)");

    // The choice survives a reload.
    await page.reload();
    await expect(page.getByText("WIN RATE")).toBeVisible({ timeout: 90_000 });
    await expect.poll(titleColor).toBe("rgb(235, 224, 221)");

    await page.getByRole("button", { name: "Light", exact: true }).click();
    await expect.poll(titleColor).toBe("rgb(31, 26, 25)");

    // System follows the OS: light, then a live flip to dark.
    await page.getByRole("button", { name: "System", exact: true }).click();
    await expect.poll(titleColor).toBe("rgb(31, 26, 25)");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(titleColor).toBe("rgb(235, 224, 221)");
  });
});
