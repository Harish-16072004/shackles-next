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

const runTag = `e2e-onspot-parity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const adminEmail = `e2e-onspot-parity-admin-${runTag}@example.test`;
const adminPassword = "playwright-onspot-parity-admin";
const participantPassword = "playwright-participant-pass";
const participantEmail = `e2e-onspot-user-${runTag}@example.test`;
const eventName = `E2E ON-SPOT PARITY ${runTag}`;

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Login" }).click();
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
      lastName: "OnSpotParityAdmin",
      email: adminEmail,
      phone: `87777${Math.floor(Math.random() * 89999 + 10000)}`,
      password: await hash(adminPassword, 10),
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      role: "ADMIN",
    },
  });

  const activeYear = Number(process.env.ACTIVE_YEAR || new Date().getUTCFullYear());

  await prisma.event.create({
    data: {
      name: eventName,
      year: activeYear,
      type: "TECHNICAL",
      participationMode: "INDIVIDUAL",
      isActive: true,
      isArchived: false,
      isTemplate: false,
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
});

test.afterAll(async () => {
  if (!databaseAvailable) return;

  const users = await prisma.user.findMany({
    where: {
      OR: [{ email: participantEmail }, { email: adminEmail }],
    },
    select: { id: true },
  });

  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.eventRegistration.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.$executeRawUnsafe('DELETE FROM "OnSpotProfile" WHERE "userId" = ANY($1)', userIds);
    await prisma.payment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.event.deleteMany({ where: { name: eventName } });
  await prisma.$disconnect();
});

test.describe("on-spot participant parity flow", () => {
  test("participant self-submit -> admin verify -> participant event registration", async ({ page }) => {
    test.skip(
      !databaseAvailable,
      "Auth e2e skipped: provide PLAYWRIGHT_DATABASE_URL or DATABASE_URL with valid DB credentials for webServer."
    );

    await page.goto("/onspot-registration");

    await page.locator('input[name="firstName"]').fill("Parity");
    await page.locator('input[name="lastName"]').fill("Participant");
    await page.locator('input[name="email"]').fill(participantEmail);
    await page.locator('input[name="phone"]').fill("9876543210");
    await page.locator('input[name="collegeName"]').fill("ACGCET");
    await page.locator('input[name="collegeLoc"]').fill("Karaikudi");
    await page.locator('input[name="department"]').fill("Mechanical");
    await page.locator('input[name="password"]').fill(participantPassword);
    await page.locator('input[name="confirmPassword"]').fill(participantPassword);
    await page.locator('#onspot-terms').check();

    await page.getByRole("button", { name: /Submit On-Spot Registration/i }).click();
    await expect(page.getByRole("heading", { name: /Submission Received/i })).toBeVisible();

    await login(page, adminEmail, adminPassword);
    await page.waitForURL(/\/admin\/adminDashboard/);

    await page.goto(`/admin/onspot-registration?tab=verify&q=${encodeURIComponent(participantEmail)}`);

    const participantRow = page.locator("tr", { hasText: participantEmail }).first();
    await expect(participantRow).toBeVisible();
    await participantRow.locator('input[name="deviceId"]').fill("E2E-VERIFY-01");
    await participantRow.getByRole("button", { name: "Verify Payment" }).click();

    const verifiedRow = page.locator("tr", { hasText: participantEmail }).first();
    await expect(verifiedRow).toContainText("VERIFIED", { timeout: 30000 });

    await login(page, participantEmail, participantPassword);
    await page.waitForURL(/\/$/);

    await page.goto("/events/technical");
    await page.getByRole("button", { name: new RegExp(eventName, "i") }).first().click();
    await page.getByRole("button", { name: /REGISTER FOR THIS EVENT/i }).click();

    await expect(page.getByText(/Joined team successfully\.|Registered successfully\./i)).toBeVisible();
  });
});
