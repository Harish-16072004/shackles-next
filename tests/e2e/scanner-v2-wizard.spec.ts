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

const runTag = `e2e-scanner-v2-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const adminEmail = `e2e-scanner-admin-${runTag}@example.test`;
const adminPassword = "playwright-admin-pass";

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
      lastName: "ScannerAdmin",
      email: adminEmail,
      phone: `85555${Math.floor(Math.random() * 89999 + 10000)}`,
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

test.describe("scanner-v2 wizard e2e parity", () => {
  test("unauthenticated users are redirected from scanner-v2 step routes", async ({ page }) => {
    await page.goto("/admin/scanner-v2?step=1");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();

    await page.goto("/admin/scanner-v2?step=6");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  });

  test("authenticated admin can open scanner-v2 step shell", async ({ page }) => {
    test.skip(
      !databaseAvailable,
      "Auth e2e skipped: provide PLAYWRIGHT_DATABASE_URL or DATABASE_URL with valid DB credentials for webServer."
    );

    await loginAsAdmin(page);

    await page.goto("/admin/scanner-v2?step=1");
    await expect(page.getByRole("heading", { name: "Scanner v2" })).toBeVisible();
    await expect(page.getByText("Step 1: Scan QR Code")).toBeVisible();
  });

  test("deep-linking to guarded steps shows gate message without prerequisite scan", async ({ page }) => {
    test.skip(
      !databaseAvailable,
      "Auth e2e skipped: provide PLAYWRIGHT_DATABASE_URL or DATABASE_URL with valid DB credentials for webServer."
    );

    await loginAsAdmin(page);

    await page.goto("/admin/scanner-v2?step=6");
    await expect(page.getByText("Step not available yet")).toBeVisible();
    await expect(page.getByText("Scan a participant first")).toBeVisible();
  });
});
