import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const registrations = await prisma.eventRegistration.findMany({
      where: { userId: session.userId },
      include: {
        event: {
          select: {
            participationMode: true,
            teamMaxSize: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
            teamCode: true,
            joinCode: true,
            leaderUserId: true,
            memberCount: true,
            status: true,       // needed to determine if invites are still open
          },
        },
      },
    });

    // Team registrations
    const teams = registrations
      .filter(reg => reg.event.participationMode === 'TEAM' && reg.team !== null)
      .map(reg => {
        const team = reg.team!;
        return {
          eventId:      reg.eventId,
          teamId:       reg.teamId,
          teamName:     team.name,
          teamCode:     team.teamCode   ?? null,
          joinCode:     team.joinCode   ?? null,
          isLeader:     team.leaderUserId === session.userId,
          memberCount:  team.memberCount,
          teamMaxSize:  reg.event.teamMaxSize ?? 4,
          teamStatus:   team.status,   // OPEN | LOCKED | DRAFT | CANCELLED etc.
          canInvite:    team.leaderUserId === session.userId &&
                        (team.status === 'OPEN' || team.status === 'DRAFT') &&
                        team.memberCount < (reg.event.teamMaxSize ?? 4),
        };
      });

    // Solo registrations (for "Registered" badge on individual events)
    const soloEventIds = registrations
      .filter(reg => reg.event.participationMode !== 'TEAM')
      .map(reg => reg.eventId);

    return NextResponse.json({ teams, soloEventIds });

  } catch (error) {
    console.error('[GET /api/events/my-registrations]', error);
    return NextResponse.json(
      { error: 'Failed to fetch registrations.' },
      { status: 500 }
    );
  }
}