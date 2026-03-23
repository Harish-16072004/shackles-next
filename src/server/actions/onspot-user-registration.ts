'use server'

import { hash } from 'bcryptjs';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { PaymentStatus, RegistrationType, Role, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const submissionAttempts = new Map<string, number[]>();

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore revalidation in non-request test environments.
  }
}

function normalizeIndianPhone(value: string) {
  const trimmed = value.replace(/[\s-]/g, '');
  const match = trimmed.match(/^(?:\+91|91)?([6-9]\d{9})$/);
  return match ? match[1] : null;
}

function getClientIpFromHeaders(store: Headers) {
  const forwarded = store.get('x-forwarded-for') || '';
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = store.get('x-real-ip') || '';
  if (realIp.trim()) return realIp.trim();
  return 'unknown';
}

function getRequestHeadersSafe() {
  try {
    return headers();
  } catch {
    return null;
  }
}

function consumeRateLimit(key: string, now: number) {
  const previous = submissionAttempts.get(key) || [];
  const fresh = previous.filter((timestamp) => now - timestamp < WINDOW_MS);

  if (fresh.length >= MAX_REQUESTS_PER_WINDOW) {
    submissionAttempts.set(key, fresh);
    return false;
  }

  fresh.push(now);
  submissionAttempts.set(key, fresh);
  return true;
}

const PublicOnSpotSchema = z.object({
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .transform((value) => normalizeIndianPhone(value))
    .refine((value): value is string => Boolean(value), {
      message: 'Invalid Indian mobile number',
    }),
  password: z.string().min(6),
  collegeName: z.string().trim().min(2),
  collegeLoc: z.string().trim().min(2),
  department: z.string().trim().min(2),
  yearOfStudy: z.string().trim().min(1),
  registrationType: z.enum(['GENERAL', 'WORKSHOP', 'COMBO']),
  amount: z.number().int().positive(),
  paymentChannel: z.enum(['CASH', 'ONLINE']).default('CASH'),
  transactionId: z.string().trim().optional(),
  proofUrl: z.string().trim().optional(),
  proofPath: z.string().trim().optional(),
  stationId: z.string().trim().optional(),
  deviceId: z.string().trim().optional(),
  referralSource: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type PublicOnSpotInput = z.infer<typeof PublicOnSpotSchema>;

export async function registerOnSpotParticipant(input: unknown) {
  const parsed = PublicOnSpotSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: 'Invalid on-spot registration data.' };
  }

  const data = parsed.data;
  const headerStore = getRequestHeadersSafe();
  const clientIp = headerStore ? getClientIpFromHeaders(headerStore) : 'unknown';
  const deviceFingerprint = (data.deviceId || '').trim().toLowerCase() || 'no-device';
  const now = Date.now();

  const rateKey = `${clientIp}:${deviceFingerprint}`;
  if (!consumeRateLimit(rateKey, now)) {
    return {
      success: false as const,
      error: 'Too many submissions from this device/network. Please wait a few minutes and try again.',
    };
  }

  const normalizedEmail = data.email.toLowerCase();

  if (data.paymentChannel === 'ONLINE' && !data.transactionId && !data.proofUrl && !data.proofPath) {
    return {
      success: false as const,
      error: 'Online payment needs transaction reference or payment proof.',
    };
  }

  const existingUserByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existingUserByEmail) {
    return { success: false as const, error: 'Email already registered. Please use a different email.' };
  }

  const existingUserByPhone = await prisma.user.findFirst({
    where: {
      phone: data.phone,
    },
    select: { id: true },
  });

  if (existingUserByPhone) {
    return {
      success: false as const,
      error: 'Phone number already registered. Please use a different mobile number.',
    };
  }

  const passwordHash = await hash(data.password, 10);
  const fallbackTransaction = `ONSPOT-PENDING-${Date.now()}`;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: normalizedEmail,
          phone: data.phone,
          password: passwordHash,
          collegeName: data.collegeName,
          collegeLoc: data.collegeLoc,
          department: data.department,
          yearOfStudy: data.yearOfStudy,
          role: Role.APPLICANT,
          registrationType: data.registrationType as RegistrationType,
          payment: {
            create: {
              amount: data.amount,
              transactionId: data.transactionId || fallbackTransaction,
              proofUrl: data.proofUrl || '',
              proofPath: data.proofPath,
              status: PaymentStatus.PENDING,
              paymentChannel: data.paymentChannel,
              captureSource: 'ON_SPOT',
            },
          },
        },
        select: { id: true },
      });

      await (tx as Prisma.TransactionClient & { onSpotProfile: { create: (args: unknown) => Promise<unknown> } }).onSpotProfile.create({
        data: {
          userId: user.id,
          stationId: data.stationId || null,
          deviceId: data.deviceId || null,
          referralSource: data.referralSource || null,
          notes: data.notes || null,
        },
      });

      return user;
    });

    safeRevalidatePath('/admin/onspot-registration');

    return {
      success: true as const,
      userId: created.id,
      message: 'On-spot submission received. Await admin payment verification.',
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return {
        success: false as const,
        error: 'Account already exists with this email or phone.',
      };
    }

    console.error('On-spot public registration failed:', error);
    return {
      success: false as const,
      error: 'Unable to submit on-spot registration right now. Please try again.',
    };
  }
}
