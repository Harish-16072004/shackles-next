'use server';

import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

interface RegisterTeamMemberParams {
  eventId: string;
  userId: string;
  teamName: string;
  role: 'LEADER' | 'MEMBER';
}

interface CreateBulkTeamParams {
  eventId: string;
  leadUserId: string;
}

interface AddTeamMemberParams {
  eventId: string;
  userId: string;
}

export async function registerTeamMember(params: RegisterTeamMemberParams) {
  const session = await getSession();

  if (!session?.email) {
    throw new Error('Unauthorized');
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const existingRegistration = await prisma.eventRegistration.findFirst({
      where: {
        eventId: params.eventId,
        userId: params.userId,
      },
    });

    if (existingRegistration) {
      throw new Error('User is already registered for this event');
    }

    const team = await prisma.team.create({
      data: {
        eventId: params.eventId,
        name: params.teamName,
        nameNormalized: params.teamName.toLowerCase().replace(/\s+/g, '_'),
        teamCode: `TEAM_${Date.now()}`,
        leaderUserId: params.userId,
        members: {
          create: {
            userId: params.userId,
            eventId: params.eventId,
            memberRole: params.role,
          },
        },
      },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    const fullName = `${user.firstName} ${user.lastName}`;

    return {
      success: true,
      teamId: team.id,
      message: `Successfully registered ${fullName} as a ${params.role}`,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to register team member');
  }
}

export async function createBulkTeam(params: CreateBulkTeamParams) {
  const session = await getSession();

  if (!session?.email) {
    throw new Error('Unauthorized');
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: params.leadUserId },
    });

    if (!user) {
      throw new Error('Lead user not found');
    }

    const team = await prisma.team.create({
      data: {
        eventId: params.eventId,
        name: `${user.firstName} ${user.lastName}'s Team`,
        nameNormalized: `${user.firstName} ${user.lastName}'s team`.toLowerCase().replace(/\s+/g, '_'),
        teamCode: `TEAM_${Date.now()}`,
        leaderUserId: params.leadUserId,
        members: {
          create: {
            userId: params.leadUserId,
            eventId: params.eventId,
            memberRole: 'LEADER',
          },
        },
      },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    const fullName = `${user.firstName} ${user.lastName}`;

    return {
      success: true,
      teamId: team.id,
      message: `Bulk team created for ${fullName}. Ready to add members.`,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to create bulk team');
  }
}

export async function addTeamMember(params: AddTeamMemberParams) {
  const session = await getSession();

  if (!session?.email) {
    throw new Error('Unauthorized');
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const existingRegistration = await prisma.eventRegistration.findFirst({
      where: {
        eventId: params.eventId,
        userId: params.userId,
      },
    });

    if (existingRegistration) {
      throw new Error('User is already registered for this event');
    }

    throw new Error('Team selection not yet implemented in this mode');
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to add team member');
  }
}

export async function getScannerBulkTeamFlowStatus() {
  const session = await getSession();

  if (!session?.email) {
    throw new Error('Unauthorized');
  }

  return {
    enabled: true,
    reason: 'Bulk flow is enabled',
  };
}
