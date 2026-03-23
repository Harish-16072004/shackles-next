import { PaymentStatus, PrismaClient, Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "@/lib/session";
import {
  approveOnSpotPayment,
  createOnSpotParticipant,
  getOnSpotParticipants,
  getOnSpotSummary,
  rejectOnSpotPayment,
} from "../../src/server/actions/onspot-registration";

const prisma = new PrismaClient();

function runTag() {
  return `onspot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureDatabaseAvailable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe("integration: on-spot registration console", () => {
  it("creates on-spot participant and reflects in list + summary", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping on-spot integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const adminEmail = `admin-${tag}@example.test`;
    const userEmail = `participant-${tag}@example.test`;
    let createdUserId: string | null = null;

    try {
      const admin = await prisma.user.create({
        data: {
          firstName: "Admin",
          lastName: "OnSpot",
          email: adminEmail,
          phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
          password: "integration-test",
          collegeName: "Control Room",
          collegeLoc: "Karaikudi",
          department: "Ops",
          yearOfStudy: "NA",
          role: Role.ADMIN,
        },
      });

      vi.mocked(getSession).mockResolvedValue({ userId: admin.id, role: "ADMIN" } as never);

      const createResult = await createOnSpotParticipant({
        firstName: "On",
        lastName: "Spot",
        email: userEmail,
        phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
        password: "password123",
        collegeName: "ACGCET",
        collegeLoc: "Karaikudi",
        department: "Mechanical",
        yearOfStudy: "IV",
        registrationType: "GENERAL",
        amount: 300,
        paymentChannel: "CASH",
        stationId: "A1",
        deviceId: "TAB-01",
        referralSource: "walkin",
        notes: "created in test",
      });

      expect(createResult.success).toBe(true);
      if (!createResult.success || !createResult.userId) {
        throw new Error("Expected on-spot user creation to succeed");
      }
      createdUserId = createResult.userId;

      const listResult = await getOnSpotParticipants({ search: tag, status: "ALL", paymentChannel: "ALL" });
      expect(listResult.success).toBe(true);
      expect(listResult.data.length).toBeGreaterThanOrEqual(1);

      const createdRow = listResult.data.find((row) => row.email === userEmail);
      expect(createdRow).toBeTruthy();
      expect((createdRow?.payment as { captureSource?: string } | null)?.captureSource).toBe("ON_SPOT");
      expect(createdRow?.payment?.status).toBe(PaymentStatus.PENDING);
      expect((createdRow as { onSpotProfile?: { stationId?: string | null } } | undefined)?.onSpotProfile?.stationId).toBe("A1");

      const summaryResult = await getOnSpotSummary();
      expect(summaryResult.success).toBe(true);
      expect(summaryResult.data.total).toBeGreaterThanOrEqual(1);
      expect(summaryResult.data.cash).toBeGreaterThanOrEqual(1);
    } finally {
      if (createdUserId) {
        await prisma.$executeRawUnsafe('DELETE FROM "OnSpotProfile" WHERE "userId" = $1', createdUserId);
        await prisma.payment.deleteMany({ where: { userId: createdUserId } });
        await prisma.user.deleteMany({ where: { id: createdUserId } });
      }

      await prisma.user.deleteMany({ where: { email: adminEmail } });
    }
  }, 30000);

  it("rejects on-spot payment and stores rejection reason", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping on-spot integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const adminEmail = `admin-${tag}@example.test`;
    const userEmail = `participant-${tag}@example.test`;
    let createdUserId: string | null = null;

    try {
      const admin = await prisma.user.create({
        data: {
          firstName: "Admin",
          lastName: "Rejector",
          email: adminEmail,
          phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
          password: "integration-test",
          collegeName: "Control Room",
          collegeLoc: "Karaikudi",
          department: "Ops",
          yearOfStudy: "NA",
          role: Role.ADMIN,
        },
      });

      vi.mocked(getSession).mockResolvedValue({ userId: admin.id, role: "ADMIN" } as never);

      const createResult = await createOnSpotParticipant({
        firstName: "Reject",
        lastName: "Me",
        email: userEmail,
        phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
        password: "password123",
        collegeName: "ACGCET",
        collegeLoc: "Karaikudi",
        department: "Civil",
        yearOfStudy: "III",
        registrationType: "GENERAL",
        amount: 300,
        paymentChannel: "CASH",
      });

      expect(createResult.success).toBe(true);
      if (!createResult.success || !createResult.userId) {
        throw new Error("Expected on-spot user creation to succeed");
      }
      createdUserId = createResult.userId;

      const rejectResult = await rejectOnSpotPayment({
        userId: createdUserId as string,
        reason: "invalid cash slip",
      });

      expect(rejectResult.success).toBe(true);

      const payment = await prisma.payment.findUnique({ where: { userId: createdUserId as string } });
      expect(payment?.status).toBe(PaymentStatus.REJECTED);
      expect(payment?.rejectionReason).toBe("invalid cash slip");
      expect((payment as { captureSource?: string } | null)?.captureSource).toBe("ON_SPOT");
    } finally {
      if (createdUserId) {
        await prisma.$executeRawUnsafe('DELETE FROM "OnSpotProfile" WHERE "userId" = $1', createdUserId);
        await prisma.payment.deleteMany({ where: { userId: createdUserId } });
        await prisma.user.deleteMany({ where: { id: createdUserId } });
      }

      await prisma.user.deleteMany({ where: { email: adminEmail } });
    }
  }, 30000);

  it("approves on-spot payment and records verification metadata", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping on-spot integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const adminEmail = `admin-${tag}@example.test`;
    const userEmail = `participant-${tag}@example.test`;
    let createdUserId: string | null = null;

    try {
      const admin = await prisma.user.create({
        data: {
          firstName: "Admin",
          lastName: "Approver",
          email: adminEmail,
          phone: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
          password: "integration-test",
          collegeName: "Control Room",
          collegeLoc: "Karaikudi",
          department: "Ops",
          yearOfStudy: "NA",
          role: Role.ADMIN,
        },
      });

      vi.mocked(getSession).mockResolvedValue({ userId: admin.id, role: "ADMIN" } as never);

      const createResult = await createOnSpotParticipant({
        firstName: "Approve",
        lastName: "Me",
        email: userEmail,
        phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
        password: "password123",
        collegeName: "ACGCET",
        collegeLoc: "Karaikudi",
        department: "Civil",
        yearOfStudy: "III",
        registrationType: "GENERAL",
        amount: 300,
        paymentChannel: "CASH",
      });

      expect(createResult.success).toBe(true);
      if (!createResult.success || !createResult.userId) {
        throw new Error("Expected on-spot user creation to succeed");
      }
      createdUserId = createResult.userId;

      const approveResult = await approveOnSpotPayment({
        userId: createdUserId,
        deviceId: "TAB-VERIFY-01",
        note: "cash verified at desk",
      });

      expect(approveResult.success).toBe(true);

      const approvedUser = await prisma.user.findUnique({
        where: { id: createdUserId },
        include: { payment: true },
      });

      expect(approvedUser?.role).toBe(Role.PARTICIPANT);
      expect(approvedUser?.payment?.status).toBe(PaymentStatus.VERIFIED);
      expect((approvedUser?.payment as { captureSource?: string } | null)?.captureSource).toBe("ON_SPOT");
      expect((approvedUser?.payment as { verificationDeviceId?: string | null } | null)?.verificationDeviceId).toBe("TAB-VERIFY-01");
      expect((approvedUser?.payment as { verificationNote?: string | null } | null)?.verificationNote).toBe("cash verified at desk");
      expect(approvedUser?.shacklesId).toBeTruthy();
    } finally {
      if (createdUserId) {
        await prisma.$executeRawUnsafe('DELETE FROM "OnSpotProfile" WHERE "userId" = $1', createdUserId);
        await prisma.payment.deleteMany({ where: { userId: createdUserId } });
        await prisma.user.deleteMany({ where: { id: createdUserId } });
      }

      await prisma.user.deleteMany({ where: { email: adminEmail } });
    }
  }, 30000);
});
