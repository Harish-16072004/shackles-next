import { expect, test } from "@playwright/test";

test.describe("public on-spot registration", () => {
  test("public route is reachable without login", async ({ page }) => {
    await page.goto("/onspot-registration");
    await expect(page).toHaveURL(/\/onspot-registration/);
    await expect(page.getByRole("heading", { name: /On-Spot Registration/i })).toBeVisible();
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("terms checkbox is required before submit", async ({ page }) => {
    await page.goto("/onspot-registration");

    await page.locator('input[name="firstName"]').fill("Public");
    await page.locator('input[name="lastName"]').fill("Tester");
    await page.locator('input[name="email"]').fill(`public-${Date.now()}@example.test`);
    await page.locator('input[name="phone"]').fill("9876543210");
    await page.locator('input[name="collegeName"]').fill("ACGCET");
    await page.locator('input[name="collegeLoc"]').fill("Karaikudi");
    await page.locator('input[name="department"]').fill("Mechanical");
    await page.locator('input[name="password"]').fill("password123");
    await page.locator('input[name="confirmPassword"]').fill("password123");

    await page.getByRole("button", { name: /Submit On-Spot Registration/i }).click();

    await expect(page.getByText(/must accept terms/i)).toBeVisible();
  });
});
