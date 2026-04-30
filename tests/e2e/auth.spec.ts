import { test, expect } from "@playwright/test";

/**
 * Auth flow E2E tests.
 * These run against the full Next.js server spun up by playwright.config.ts.
 * They do NOT require seeded users — they validate UI behaviour and
 * redirect guards independently of credentials.
 */
test.describe("Authentication – login page", () => {
  test("loads login page with form elements", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Shackles/i);
    await expect(page.locator("form")).toBeVisible();
    await expect(
      page.locator('input[type="email"], input[name="email"]')
    ).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("stays on login page after empty form submission", async ({ page }) => {
    await page.goto("/login");
    await page.locator('button[type="submit"]').click();
    // Browser-level or server-level validation — should NOT navigate away
    await expect(page).toHaveURL(/login/);
  });

  test("shows error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill("notareal@example.com");
    await page.locator('input[type="password"]').fill("wrongpassword");
    await page.locator('button[type="submit"]').click();
    // Must stay on login and not throw an unhandled 500
    await expect(page).toHaveURL(/login/);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("does not expose a stack trace on bad login", async ({ page }) => {
    await page.goto("/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .fill("hacker@example.com");
    await page.locator('input[type="password"]').fill("password123");
    await page.locator('button[type="submit"]').click();
    await expect(page.locator("body")).not.toContainText("at Object");
    await expect(page.locator("body")).not.toContainText("prisma");
  });
});

test.describe("Authentication – route guards", () => {
  test("unauthenticated /admin redirects to login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/login/);
  });

  test("unauthenticated /admin/events redirects to login", async ({ page }) => {
    await page.goto("/admin/events");
    await expect(page).toHaveURL(/login/);
  });

  test("unauthenticated protected nested routes redirect to login", async ({ page }) => {
    await page.goto("/admin/attendance");
    await expect(page).toHaveURL(/login/);
  });

  test("login page does not require authentication", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).not.toBe(401);
    expect(response?.status()).not.toBe(403);
  });
});

test.describe("Authentication – page resilience", () => {
  test("login page renders without JS errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    // Filter known benign third-party errors
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("fonts")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
