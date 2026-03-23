'use server';

import { type Session } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

interface CheckinParams {
  eventId: string;
  personId: string;
}

export async function checkinParticipant(params: CheckinParams) {
  const session = (await getServerSession(authOptions)) as Session | null;

  if (!session?.user?.email) {
    return {
      success: false,
      error: 'Unauthorized',
    };
  }

  try {
    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      return {
        success: false,
        error: 'Event not found',
      };
    }

    // Verify person exists
    const person = await prisma.person.findUnique({
      where: { id: params.personId },
    });

    if (!person) {
      return {
        success: false,
        error: 'Person not found',
      };
    }

    // Check if person is registered for this event
    const team = await prisma.team.findFirst({
      where: {
        eventId: params.eventId,
        members: {
          some: {
            personId: params.personId,
          },
        },
      },
      include: {
        members: {
          where: {
            personId: params.personId,
          },
        },
      },
    });

    if (!team || !team.members.length) {
      return {
        success: false,
        error: 'Person is not registered for this event',
      };
    }

    // Update check-in status
    const updatedMember = await prisma.teamMember.update({
      where: {
        id: team.members[0].id,
      },
      data: {
        checkedInAt: new Date(),
      },
      include: {
        person: true,
        team: {
          include: {
            event: true,
          },
        },
      },
    });

    return {
      success: true,
      data: {
        personId: updatedMember.personId,
        personName: updatedMember.person.fullName,
        eventId: updatedMember.team.eventId,
        eventName: updatedMember.team.event.name,
        checkedInAt: updatedMember.checkedInAt,
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

export async function getParticipantCheckinStatus(eventId: string, personId: string) {
  const session = (await getServerSession(authOptions)) as Session | null;

  if (!session?.user?.email) {
    return {
      success: false,
      error: 'Unauthorized',
    };
  }

  try {
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        personId: personId,
        team: {
          eventId: eventId,
        },
      },
      include: {
        person: true,
        team: {
          include: {
            event: true,
          },
        },
      },
    });

    if (!teamMember) {
      return {
        success: false,
        error: 'Participant not found',
      };
    }

    return {
      success: true,
      data: {
        personName: teamMember.person.fullName,
        eventName: teamMember.team.event.name,
        checkedInAt: teamMember.checkedInAt,
        isCheckedIn: !!teamMember.checkedInAt,
      },
    };
  } catch (error) {
    console.error('Status check error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Status check failed',
    };
  }
}
