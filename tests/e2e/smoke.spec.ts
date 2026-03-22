import { expect, test } from "@playwright/test";

test.describe("Phase 4 E2E smoke", () => {
  test("renders login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  });

  test("renders participant registration page", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: "Shackles '25 Registration" })).toBeVisible();
  });

  test("redirects unauthenticated admin dashboard to login", async ({ page }) => {
    await page.goto("/admin/adminDashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  });

  test("redirects unauthenticated scanner page to login", async ({ page }) => {
    await page.goto("/admin/scanner");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  });
});
