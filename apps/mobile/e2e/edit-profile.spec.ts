import { expect, test } from "@playwright/test";

test.describe("edit profile", () => {
  test("EDIT opens the editor and persists name + side", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("WIN RATE")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText("Nico", { exact: true })).toBeVisible();
    await expect(page.getByText(/plays left side/iu)).toBeVisible();

    // The EDIT button must actually open the editor (the reported bug).
    await page.getByRole("button", { name: "Edit profile" }).click();
    await expect(page.getByText("EDIT PROFILE")).toBeVisible();

    await page.getByTestId("edit-name").fill("Nicolas");
    await page.getByTestId("side-right").click();
    await page.getByTestId("save-profile").click();

    // Back on the profile, the changes are persisted and shown.
    await expect(page.getByText("Nicolas", { exact: true })).toBeVisible();
    await expect(page.getByText(/plays right side/iu)).toBeVisible();
  });

  test("CANCEL leaves the profile unchanged", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("Nico", { exact: true })).toBeVisible({ timeout: 90_000 });

    await page.getByRole("button", { name: "Edit profile" }).click();
    await page.getByTestId("edit-name").fill("Changed");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("Nico", { exact: true })).toBeVisible();
  });
});
