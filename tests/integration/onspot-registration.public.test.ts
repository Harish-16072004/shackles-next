import { PaymentStatus, PrismaClient, Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { registerOnSpotParticipant } from '../../src/server/actions/onspot-user-registration';

const prisma = new PrismaClient();

function runTag() {
  return `onspot-public-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureDatabaseAvailable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe('integration: on-spot public registration', () => {
  it('creates pending on-spot applicant with ON_SPOT payment source', async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn('Skipping public on-spot integration test: database is not reachable.');
      return;
    }

    const tag = runTag();
    const userEmail = `${tag}@example.test`;
    const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;

    let createdUserId: string | null = null;

    try {
      const result = await registerOnSpotParticipant({
        firstName: 'Public',
        lastName: 'User',
        email: userEmail,
        phone,
        password: 'password123',
        collegeName: 'ACGCET',
        collegeLoc: 'Karaikudi',
        department: 'Mechanical',
        yearOfStudy: 'IV',
        registrationType: 'GENERAL',
        amount: 500,
        paymentChannel: 'CASH',
        referralSource: 'friend',
      });

      expect(result.success).toBe(true);
      if (!result.success || !result.userId) {
        throw new Error('Expected public on-spot creation to succeed');
      }

      createdUserId = result.userId;

      const createdUser = await prisma.user.findUnique({
        where: { id: createdUserId },
        include: { payment: true, onSpotProfile: true },
      });

      expect(createdUser).toBeTruthy();
      expect(createdUser?.role).toBe(Role.APPLICANT);
      expect(createdUser?.payment?.status).toBe(PaymentStatus.PENDING);
      expect((createdUser?.payment as { captureSource?: string } | null)?.captureSource).toBe('ON_SPOT');
      expect(createdUser?.onSpotProfile).toBeTruthy();
      expect(createdUser?.shacklesId).toBeNull();
    } finally {
      if (createdUserId) {
        await prisma.$executeRawUnsafe('DELETE FROM "OnSpotProfile" WHERE "userId" = $1', createdUserId);
        await prisma.payment.deleteMany({ where: { userId: createdUserId } });
        await prisma.user.deleteMany({ where: { id: createdUserId } });
      }
    }
  }, 30000);

  it('rejects duplicate email submissions', async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn('Skipping public on-spot integration test: database is not reachable.');
      return;
    }

    const tag = runTag();
    const userEmail = `${tag}@example.test`;

    let createdUserId: string | null = null;

    try {
      const first = await registerOnSpotParticipant({
        firstName: 'First',
        lastName: 'Submit',
        email: userEmail,
        phone: `8${Math.floor(100000000 + Math.random() * 899999999)}`,
        password: 'password123',
        collegeName: 'ACGCET',
        collegeLoc: 'Karaikudi',
        department: 'Mechanical',
        yearOfStudy: 'IV',
        registrationType: 'GENERAL',
        amount: 500,
        paymentChannel: 'CASH',
      });

      expect(first.success).toBe(true);
      if (!first.success || !first.userId) {
        throw new Error('Expected initial submission to succeed');
      }
      createdUserId = first.userId;

      const second = await registerOnSpotParticipant({
        firstName: 'Second',
        lastName: 'Submit',
        email: userEmail,
        phone: `7${Math.floor(100000000 + Math.random() * 899999999)}`,
        password: 'password123',
        collegeName: 'ACGCET',
        collegeLoc: 'Karaikudi',
        department: 'Mechanical',
        yearOfStudy: 'IV',
        registrationType: 'GENERAL',
        amount: 500,
        paymentChannel: 'CASH',
      });

      expect(second.success).toBe(false);
      if (second.success) {
        throw new Error('Expected duplicate submission to fail');
      }

      expect(second.error).toMatch(/Email already registered/i);
    } finally {
      if (createdUserId) {
        await prisma.$executeRawUnsafe('DELETE FROM "OnSpotProfile" WHERE "userId" = $1', createdUserId);
        await prisma.payment.deleteMany({ where: { userId: createdUserId } });
        await prisma.user.deleteMany({ where: { id: createdUserId } });
      }
    }
  }, 30000);
});
