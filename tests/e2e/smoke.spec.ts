import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let databaseAvailable = true;

const activeYear = Number(process.env.ACTIVE_YEAR || new Date().getUTCFullYear());
const archivedYear = activeYear - 1;
const runTag = `e2e-year-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const publicVisibleEvent = `E2E-ACTIVE-${runTag}`;
const publicHiddenArchived = `E2E-ARCHIVED-${runTag}`;
const publicHiddenOldYear = `E2E-OLDYEAR-${runTag}`;
const adminEmail = `e2e-admin-${runTag}@example.test`;

async function createAdminSessionCookie(userId: string) {
  const sessionSecret = process.env.SESSION_SECRET || "phase4-e2e-session-secret-which-is-at-least-32-chars";
  const encodedKey = new TextEncoder().encode(sessionSecret);

  return new SignJWT({ userId, role: "ADMIN", displayName: "E2E Admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(encodedKey);
}

test.beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    databaseAvailable = false;
    return;
  }

  await prisma.user.create({
    data: {
      firstName: "E2E",
      lastName: "Admin",
      email: adminEmail,
      phone: `83333${Math.floor(Math.random() * 89999 + 10000)}`,
      password: "playwright-test",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      role: "ADMIN",
    },
  });

  await prisma.event.createMany({
    data: [
      {
        name: publicVisibleEvent,
        year: activeYear,
        type: "TECHNICAL",
        isActive: true,
        isArchived: false,
        isTemplate: false,
      },
      {
        name: publicHiddenArchived,
        year: archivedYear,
        type: "TECHNICAL",
        isActive: false,
        isArchived: true,
        isTemplate: false,
      },
      {
        name: publicHiddenOldYear,
        year: archivedYear,
        type: "TECHNICAL",
        isActive: true,
        isArchived: false,
        isTemplate: false,
      },
    ],
  });
});

test.afterAll(async () => {
  if (!databaseAvailable) return;

  await prisma.eventRegistration.deleteMany({
    where: {
      event: {
        name: {
          in: [publicVisibleEvent, publicHiddenArchived, publicHiddenOldYear],
        },
      },
    },
  });

  await prisma.event.deleteMany({
    where: {
      name: {
        in: [publicVisibleEvent, publicHiddenArchived, publicHiddenOldYear],
      },
    },
  });

  await prisma.payment.deleteMany({ where: { user: { email: adminEmail } } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
  await prisma.$disconnect();
});

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
    await expect(page.getByRole("heading", { name: /Shackles '\d{2} Registration/i })).toBeVisible();
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

  test("public pages show active year and hide archived year events", async ({ page }) => {
    test.skip(!databaseAvailable, "Database is not reachable for year-flip smoke checks.");

    await page.goto("/events/technical");

    await expect(page.getByRole("heading", { name: "Technical Events" })).toBeVisible();
    await expect(page.getByText(publicVisibleEvent)).toBeVisible();
    await expect(page.getByText(publicHiddenArchived)).not.toBeVisible();
    await expect(page.getByText(publicHiddenOldYear)).not.toBeVisible();
  });

  test("admin can browse archived year events with explicit year filter", async ({ page }) => {
    test.skip(!databaseAvailable, "Database is not reachable for year-flip smoke checks.");

    const admin = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true },
    });

    test.skip(!admin, "Admin bootstrap user not available for e2e admin smoke test.");

    const cookie = await createAdminSessionCookie(admin!.id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3100";

    await page.context().addCookies([
      {
        name: "session",
        value: cookie,
        url: appUrl,
        httpOnly: true,
        path: "/",
      },
    ]);

    await page.goto(`/admin/events?year=${archivedYear}&showArchived=true&q=${encodeURIComponent(publicHiddenArchived)}`);
    await expect(page.getByRole("heading", { name: "Event Management" })).toBeVisible();
    await expect(page.getByText(publicHiddenArchived)).toBeVisible();
    await expect(page.getByText("Archived").first()).toBeVisible();
  });
});
