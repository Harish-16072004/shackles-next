import { test, expect } from "@playwright/test";

/**
 * Team registration & event browsing E2E tests.
 * Tests validate UI structure and resilience — they do not depend on
 * seeded event data and use conditional skips where data is required.
 */
test.describe("Events – public listing", () => {
  test("events page loads without errors", async ({ page }) => {
    const response = await page.goto("/events");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });

  test("events page has correct title", async ({ page }) => {
    await page.goto("/events");
    await expect(page).toHaveTitle(/Shackles/i);
  });

  test("events page renders empty state gracefully when no events", async ({ page }) => {
    await page.goto("/events");
    // Should not crash with a blank white screen or 500
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("at Object.");
  });

  test("individual event page loads if events exist", async ({ page }) => {
    await page.goto("/events");
    const eventLinks = page.locator("a[href*='/events/']");
    const count = await eventLinks.count();
    if (count === 0) {
      test.skip(); // No events seeded in CI — acceptable
      return;
    }
    await eventLinks.first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});

test.describe("On-spot registration", () => {
  test("on-spot registration page loads", async ({ page }) => {
    const response = await page.goto("/onspot-registration");
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveTitle(/Shackles/i);
    await expect(page.locator("main")).toBeVisible();
  });

  test("on-spot registration does not leak server errors", async ({ page }) => {
    await page.goto("/onspot-registration");
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("prisma");
  });

  test("on-spot registration form is present or shows closed state", async ({ page }) => {
    await page.goto("/onspot-registration");
    // Either a form OR a friendly closed/no-events message — both are acceptable
    const hasForm = (await page.locator("form").count()) > 0;
    const hasClosedMessage =
      (await page.locator("body").textContent())?.match(
        /closed|no.*event|unavailable|not available/i
      ) !== null;
    expect(hasForm || hasClosedMessage).toBeTruthy();
  });

  test("submitting empty on-spot form shows validation, not 500", async ({ page }) => {
    await page.goto("/onspot-registration");
    const form = page.locator("form").first();
    if ((await form.count()) === 0) {
      test.skip(); // No form rendered (registration closed)
      return;
    }
    const submit = form.locator('button[type="submit"]');
    if ((await submit.count()) === 0) {
      test.skip();
      return;
    }
    await submit.click();
    // Should not navigate to a 500 error page
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});

test.describe("Terms and conditions", () => {
  test("terms page loads", async ({ page }) => {
    const response = await page.goto("/terms-and-conditions");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("main")).toBeVisible();
  });
});
