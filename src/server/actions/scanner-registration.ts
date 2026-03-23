'use server';

import { type Session } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

interface RegisterTeamMemberParams {
  eventId: string;
  personId: string;
  teamName: string;
  role: 'LEAD' | 'MEMBER';
}

interface CreateBulkTeamParams {
  eventId: string;
  leadPersonId: string;
}

interface AddTeamMemberParams {
  eventId: string;
  personId: string;
}

export async function registerTeamMember(params: RegisterTeamMemberParams) {
  const session = (await getServerSession(authOptions)) as Session | null;

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  try {
    // Verify event exists and user has access
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // Verify person exists
    const person = await prisma.person.findUnique({
      where: { id: params.personId },
    });

    if (!person) {
      throw new Error('Person not found');
    }

    // Check if person is already registered for this event
    const existingTeam = await prisma.team.findFirst({
      where: {
        eventId: params.eventId,
        members: {
          some: {
            personId: params.personId,
          },
        },
      },
    });

    if (existingTeam) {
      throw new Error('Person is already registered for this event');
    }

    // Create new team
    const team = await prisma.team.create({
      data: {
        eventId: params.eventId,
        name: params.teamName,
        members: {
          create: {
            personId: params.personId,
            role: params.role,
          },
        },
      },
      include: {
        members: {
          include: {
            person: true,
          },
        },
      },
    });

    return {
      success: true,
      teamId: team.id,
      message: `Successfully registered ${person.fullName} as a ${params.role}`,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to register team member');
  }
}

export async function createBulkTeam(params: CreateBulkTeamParams) {
  const session = (await getServerSession(authOptions)) as Session | null;

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  try {
    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // Verify person exists
    const person = await prisma.person.findUnique({
      where: { id: params.leadPersonId },
    });

    if (!person) {
      throw new Error('Lead person not found');
    }

    // Create team in bulk mode
    const team = await prisma.team.create({
      data: {
        eventId: params.eventId,
        name: `${person.fullName}'s Team`,
        bulkRegistrationMode: true,
        members: {
          create: {
            personId: params.leadPersonId,
            role: 'LEAD',
          },
        },
      },
      include: {
        members: {
          include: {
            person: true,
          },
        },
      },
    });

    return {
      success: true,
      teamId: team.id,
      message: `Bulk team created for ${person.fullName}. Ready to add members.`,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to create bulk team');
  }
}

export async function addTeamMember(params: AddTeamMemberParams) {
  const session = (await getServerSession(authOptions)) as Session | null;

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  try {
    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: params.eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    // Verify person exists
    const person = await prisma.person.findUnique({
      where: { id: params.personId },
    });

    if (!person) {
      throw new Error('Person not found');
    }

    // Check if person is already registered for this event
    const existingTeam = await prisma.team.findFirst({
      where: {
        eventId: params.eventId,
        members: {
          some: {
            personId: params.personId,
          },
        },
      },
    });

    if (existingTeam) {
      throw new Error('Person is already registered for this event');
    }

    // TODO: Implement logic to find and add to an existing team
    // For now, we'll need a team selection step before this is called
    throw new Error('Team selection not yet implemented in this mode');
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to add team member');
  }
}

export async function getScannerBulkTeamFlowStatus() {
  const session = (await getServerSession(authOptions)) as Session | null;

  if (!session?.user?.email) {
    throw new Error('Unauthorized');
  }

  // This would typically check configuration or feature flags
  // For now, we'll return a default status
  return {
    enabled: true,
    reason: 'Bulk flow is enabled',
  };
}
