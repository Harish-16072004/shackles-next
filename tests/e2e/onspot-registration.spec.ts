import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();
let databaseAvailable = true;

const configuredDbUrl = process.env.PLAYWRIGHT_DATABASE_URL || process.env.DATABASE_URL || "";
const hasCredentialedPlaywrightDb = (() => {
  if (!configuredDbUrl) return false;

  try {
    return Boolean(new URL(configuredDbUrl).username);
  } catch {
    return false;
  }
})();

const runTag = `e2e-onspot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const adminEmail = `e2e-onspot-admin-${runTag}@example.test`;
const adminPassword = "playwright-onspot-pass";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(adminEmail);
  await page.locator('input[name="password"]').fill(adminPassword);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/\/admin\/adminDashboard/);
}

test.beforeAll(async () => {
  if (!hasCredentialedPlaywrightDb) {
    databaseAvailable = false;
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseAvailable = false;
    return;
  }

  await prisma.user.create({
    data: {
      firstName: "E2E",
      lastName: "OnSpotAdmin",
      email: adminEmail,
      phone: `86666${Math.floor(Math.random() * 89999 + 10000)}`,
      password: await hash(adminPassword, 10),
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      role: "ADMIN",
    },
  });
});

test.afterAll(async () => {
  if (!databaseAvailable) return;
  await prisma.payment.deleteMany({ where: { user: { email: adminEmail } } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
  await prisma.$disconnect();
});

test.describe("on-spot registration console e2e", () => {
  test("unauthenticated users are redirected from on-spot console", async ({ page }) => {
    await page.goto("/admin/onspot-registration");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  });

  test("authenticated admin can open on-spot console shell", async ({ page }) => {
    test.skip(
      !databaseAvailable,
      "Auth e2e skipped: provide PLAYWRIGHT_DATABASE_URL or DATABASE_URL with valid DB credentials for webServer."
    );

    await loginAsAdmin(page);

    await page.goto("/admin/onspot-registration");
    await expect(page.getByRole("heading", { name: /On-Spot Registration Console/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Register" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Verify Payments" })).toBeVisible();
    await expect(page.getByRole("link", { name: "On-Spot Users" })).toBeVisible();
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('select[name="paymentChannel"]')).toBeVisible();
  });

  test("verify tab is reachable and renders filter controls", async ({ page }) => {
    test.skip(
      !databaseAvailable,
      "Auth e2e skipped: provide PLAYWRIGHT_DATABASE_URL or DATABASE_URL with valid DB credentials for webServer."
    );

    await loginAsAdmin(page);

    await page.goto("/admin/onspot-registration?tab=verify");
    await expect(page.getByRole("heading", { name: /On-Spot Registration Console/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "PENDING" })).toBeVisible();
    await expect(page.getByRole("link", { name: "VERIFIED" })).toBeVisible();
    await expect(page.getByRole("link", { name: "REJECTED" })).toBeVisible();
    await expect(page.locator('input[name="q"]')).toBeVisible();
  });
});
