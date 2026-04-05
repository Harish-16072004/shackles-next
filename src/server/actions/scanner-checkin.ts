'use server';

import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

interface CheckinParams {
  eventId: string;
  userId: string;
}

export async function checkinParticipant(params: CheckinParams) {
  const session = await getSession();

  if (!session?.email) {
    return {
      success: false,
      error: 'Unauthorized',
    };
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      return {
        success: false,
        error: 'Event not found',
      };
    }

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    const registration = await prisma.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: params.userId,
          eventId: params.eventId,
        },
      },
      include: {
        event: true,
      },
    });

    if (!registration) {
      return {
        success: false,
        error: 'User is not registered for this event',
      };
    }

    const updatedRegistration = await prisma.eventRegistration.update({
      where: {
        userId_eventId: {
          userId: params.userId,
          eventId: params.eventId,
        },
      },
      data: {
        attended: true,
        attendedAt: new Date(),
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        event: true,
      },
    });

    return {
      success: true,
      data: {
        userId: updatedRegistration.userId,
        userName: `${updatedRegistration.user.firstName} ${updatedRegistration.user.lastName}`,
        eventId: updatedRegistration.eventId,
        eventName: updatedRegistration.event.name,
        checkedInAt: updatedRegistration.attendedAt,
      },
    };
  } catch (error) {
    console.error('Check-in error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Check-in failed',
    };
  }
}

export async function getParticipantCheckinStatus(eventId: string, userId: string) {
  const session = await getSession();

  if (!session?.email) {
    return {
      success: false,
      error: 'Unauthorized',
    };
  }

  try {
    const registration = await prisma.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: userId,
          eventId: eventId,
        },
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        event: true,
      },
    });

    if (!registration) {
      return {
        success: false,
        error: 'Participant not found',
      };
    }

    return {
      success: true,
      data: {
        userName: `${registration.user.firstName} ${registration.user.lastName}`,
        eventName: registration.event.name,
        checkedInAt: registration.attendedAt,
        isCheckedIn: !!registration.attendedAt,
      },
    };
  } catch (error) {
    console.error('Check-in status error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get check-in status',
    };
  }
}
