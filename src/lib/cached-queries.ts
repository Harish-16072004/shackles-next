import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/prisma';

/**
 * Cached dashboard statistics — revalidates every 30 seconds.
 * This prevents 11+ concurrent Prisma queries on every admin dashboard page load.
 */
export const getCachedDashboardStats = unstable_cache(
  async () => {
    const [
      totalRegistrations,
      verifiedPayments,
      pendingPayments,
      generalOnly,
      workshopOnly,
      bothTypes,
      kitsIssued,
      totalAccommodations,
      maleAccommodations,
      femaleAccommodations,
      events,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.payment.count({ where: { status: 'VERIFIED' } }),
      prisma.payment.count({ where: { status: 'PENDING' } }),
      prisma.user.count({ where: { registrationType: 'GENERAL' } }),
      prisma.user.count({ where: { registrationType: 'WORKSHOP' } }),
      prisma.user.count({ where: { registrationType: 'COMBO' } }),
      prisma.user.count({ where: { kitStatus: 'ISSUED' } }),
      prisma.accommodation.count(),
      prisma.accommodation.count({ where: { gender: 'MALE' } }),
      prisma.accommodation.count({ where: { gender: 'FEMALE' } }),
      prisma.event
        .findMany({
          orderBy: { name: 'asc' },
          include: {
            registrations: {
              select: { teamSize: true },
            },
          },
        })
        .catch(() => []),
    ]);

    return {
      totalRegistrations,
      verifiedPayments,
      pendingPayments,
      generalOnly,
      workshopOnly,
      bothTypes,
      kitsIssued,
      totalAccommodations,
      maleAccommodations,
      femaleAccommodations,
      events,
    };
  },
  ['dashboard-stats'],
  { revalidate: 30 }
);

/**
 * Cached on-spot summary — revalidates every 15 seconds.
 */
export const getCachedOnSpotSummary = unstable_cache(
  async () => {
    const [total, pending, verified, rejected, cash, online] = await Promise.all([
      prisma.user.count({ where: { onSpotProfile: { isNot: null } } }),
      prisma.payment.count({
        where: { user: { onSpotProfile: { isNot: null } }, status: 'PENDING' },
      }),
      prisma.payment.count({
        where: { user: { onSpotProfile: { isNot: null } }, status: 'VERIFIED' },
      }),
      prisma.payment.count({
        where: { user: { onSpotProfile: { isNot: null } }, status: 'REJECTED' },
      }),
      prisma.payment.count({
        where: {
          user: { onSpotProfile: { isNot: null } },
          paymentChannel: 'CASH',
        },
      }),
      prisma.payment.count({
        where: {
          user: { onSpotProfile: { isNot: null } },
          paymentChannel: 'ONLINE',
        },
      }),
    ]);

    return { total, pending, verified, rejected, cash, online };
  },
  ['onspot-summary'],
  { revalidate: 15 }
);
