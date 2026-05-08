'use server'

import { z } from 'zod';
import { hash } from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { Permission, PaymentCaptureSource, PaymentChannel, PaymentStatus, Role, RegistrationType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { verifyUserPayment } from '@/server/actions/admin';
import { requireGlobalPermission } from '@/server/services/scanner-auth.service';
import { BCRYPT_ROUNDS } from '@/lib/crypto-config';

const CreateOnSpotParticipantSchema = z.object({
	firstName: z.string().trim().min(2),
	lastName: z.string().trim().min(1),
	email: z.string().trim().email(),
	phone: z.string().trim().min(10),
	password: z.string().min(8),
	collegeName: z.string().trim().min(2),
	collegeLoc: z.string().trim().min(2),
	department: z.string().trim().min(2),
	yearOfStudy: z.string().trim().min(1),
	gender: z.enum(['MALE', 'FEMALE', 'OTHER']),
	registrationType: z.enum(['GENERAL', 'WORKSHOP', 'COMBO']),
	amount: z.number().int().nonnegative(),
	paymentChannel: z.enum(['CASH', 'ONLINE']),
	transactionId: z.string().trim().optional(),
	proofUrl: z.string().trim().optional(),
	proofPath: z.string().trim().optional(),
	stationId: z.string().trim().optional(),
	deviceId: z.string().trim().optional(),
	referralSource: z.string().trim().optional(),
	notes: z.string().trim().optional(),
});

type OnSpotListFilters = {
	search?: string;
	status?: PaymentStatus | 'ALL';
	paymentChannel?: PaymentChannel | 'ALL';
	page?: number;
	pageSize?: number;
};

type OnSpotParticipantRow = Prisma.UserGetPayload<{
	include: {
		payment: true;
		onSpotProfile: true;
		registrations: {
			include: {
				event: {
					select: { name: true };
				};
			};
		};
	};
}>;

async function requireOnSpotActor() {
	const auth = await requireGlobalPermission(Permission.ONSPOT_INDIVIDUAL_REG);
	if (!auth.ok) {
		return { ok: false as const, error: auth.message };
	}

	return { ok: true as const, actor: auth.actor };
}

async function requireAdminActor() {
	const session = await auth();
	if (!session?.user?.id) {
		return { ok: false as const, error: 'Authentication required.' };
	}
	if (session.user.role !== Role.ADMIN) {
		return { ok: false as const, error: 'Admin access required.' };
	}
	return { ok: true as const, actor: { id: session.user.id, role: session.user.role } };
}

export async function createOnSpotParticipant(input: unknown) {
	const actorResult = await requireOnSpotActor();
	if (!actorResult.ok) return { success: false, error: actorResult.error };

	const parsed = CreateOnSpotParticipantSchema.safeParse(input);
	if (!parsed.success) {
		return { success: false, error: 'Invalid on-spot registration data.' };
	}

	const data = parsed.data;

	const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
	if (existingUser) {
		return { success: false, error: 'Email already exists. Use existing account flow.' };
	}

	if (data.paymentChannel === PaymentChannel.ONLINE && !data.transactionId && !data.proofUrl && !data.proofPath) {
		return { success: false, error: 'Online on-spot payment needs transaction reference or proof.' };
	}

	const passwordHash = await hash(data.password, BCRYPT_ROUNDS);
	const fallbackTransaction = `ONSPOT-${Date.now()}`;

	const created = await prisma.$transaction(async (tx) => {
		const user = await tx.user.create({
			data: {
				firstName: data.firstName,
				lastName: data.lastName,
				email: data.email.toLowerCase(),
				phone: data.phone,
				password: passwordHash,
				collegeName: data.collegeName,
				collegeLoc: data.collegeLoc,
				department: data.department,
				yearOfStudy: data.yearOfStudy,
				gender: data.gender,
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
						captureSource: PaymentCaptureSource.ON_SPOT,
					},
				},
			},
			select: { id: true },
		});

		await tx.onSpotProfile.create({
			data: {
				userId: user.id,
				createdByUserId: actorResult.actor.id,
				stationId: data.stationId || null,
				deviceId: data.deviceId || null,
				referralSource: data.referralSource || null,
				notes: data.notes || null,
			},
		});

		return user;
	});

	revalidatePath('/admin/onspot-registration');
	revalidatePath('/admin/adminDashboard');

	return {
		success: true,
		userId: created.id,
		message: 'On-spot participant created. Verify payment to activate participant access.',
	};
}

export async function approveOnSpotPayment(input: { userId: string; deviceId?: string; note?: string }) {
	const actorResult = await requireAdminActor();
	if (!actorResult.ok) return { success: false, error: actorResult.error };

	const payment = await prisma.payment.findUnique({
		where: { userId: input.userId },
		select: { id: true, captureSource: true },
	});

	if (!payment || payment.captureSource !== PaymentCaptureSource.ON_SPOT) {
		return { success: false, error: 'On-spot payment record not found.' };
	}

	const result = await verifyUserPayment(input.userId, 'APPROVE');
	if (!result.success) {
		return { success: false, error: result.error || 'Unable to approve payment.' };
	}

	await prisma.payment.update({
		where: { userId: input.userId },
		data: {
			verifiedBy: actorResult.actor.id,
			verificationDeviceId: input.deviceId || null,
			verificationNote: input.note || null,
		},
	});

	revalidatePath('/admin/onspot-registration');
	return { success: true };
}

export async function rejectOnSpotPayment(input: { userId: string; reason?: string; note?: string }) {
	const actorResult = await requireAdminActor();
	if (!actorResult.ok) return { success: false, error: actorResult.error };

	const payment = await prisma.payment.findUnique({
		where: { userId: input.userId },
		select: { id: true, captureSource: true },
	});

	if (!payment || payment.captureSource !== PaymentCaptureSource.ON_SPOT) {
		return { success: false, error: 'On-spot payment record not found.' };
	}

	const result = await verifyUserPayment(input.userId, 'REJECT');
	if (!result.success) {
		return { success: false, error: result.error || 'Unable to reject payment.' };
	}

	await prisma.payment.update({
		where: { userId: input.userId },
		data: {
			rejectionReason: input.reason || null,
			verificationNote: input.note || null,
			verifiedBy: actorResult.actor.id,
		},
	});

	revalidatePath('/admin/onspot-registration');
	return { success: true };
}

export async function getOnSpotParticipants(filters: OnSpotListFilters = {}) {
	const actorResult = await requireAdminActor();
	if (!actorResult.ok) {
		return { success: false as const, error: actorResult.error, data: [] as OnSpotParticipantRow[], total: 0 };
	}

	const search = (filters.search || '').trim();
	const status = filters.status || 'ALL';
	const paymentChannel = filters.paymentChannel || 'ALL';
	const page = Math.max(1, filters.page || 1);
	const pageSize = filters.pageSize || 25;

	const where = {
		onSpotProfile: { isNot: null },
		...(search
			? {
					OR: [
						{ firstName: { contains: search, mode: 'insensitive' as const } },
						{ lastName: { contains: search, mode: 'insensitive' as const } },
						{ email: { contains: search, mode: 'insensitive' as const } },
						{ phone: { contains: search, mode: 'insensitive' as const } },
						{ shacklesId: { contains: search, mode: 'insensitive' as const } },
					],
				}
			: {}),
		payment: {
			...(status !== 'ALL' ? { status } : {}),
			...(paymentChannel !== 'ALL' ? { paymentChannel } : {}),
			captureSource: PaymentCaptureSource.ON_SPOT,
		},
	};

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where,
			include: {
				payment: true,
				onSpotProfile: true,
				registrations: {
					include: {
						event: {
							select: { name: true },
						},
					},
					orderBy: { createdAt: 'desc' },
					take: 5,
				},
			},
			orderBy: { createdAt: 'desc' },
			skip: (page - 1) * pageSize,
			take: pageSize,
		}),
		prisma.user.count({ where }),
	]);

	return { success: true as const, data: users, total };
}

export async function getOnSpotSummary() {
	const actorResult = await requireAdminActor();
	if (!actorResult.ok) {
		return {
			success: false,
			error: actorResult.error,
			data: { total: 0, pending: 0, verified: 0, rejected: 0, cash: 0, online: 0 },
		};
	}

	const [total, pending, verified, rejected, cash, online] = await Promise.all([
		prisma.payment.count({ where: { captureSource: PaymentCaptureSource.ON_SPOT } }),
		prisma.payment.count({ where: { captureSource: PaymentCaptureSource.ON_SPOT, status: PaymentStatus.PENDING } }),
		prisma.payment.count({ where: { captureSource: PaymentCaptureSource.ON_SPOT, status: PaymentStatus.VERIFIED } }),
		prisma.payment.count({ where: { captureSource: PaymentCaptureSource.ON_SPOT, status: PaymentStatus.REJECTED } }),
		prisma.payment.count({ where: { captureSource: PaymentCaptureSource.ON_SPOT, paymentChannel: PaymentChannel.CASH } }),
		prisma.payment.count({ where: { captureSource: PaymentCaptureSource.ON_SPOT, paymentChannel: PaymentChannel.ONLINE } }),
	]);

	return {
		success: true,
		data: { total, pending, verified, rejected, cash, online },
	};
}