import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !session.userId) {
      return NextResponse.json({ teams: [] });
    }

    const unparsedRegistrations = await prisma.eventRegistration.findMany({
      where: {
        userId: session.userId,
      },
      include: {
        event: {
          select: {
            participationMode: true,
            teamMaxSize: true,
          }
        },
        team: {
          select: {
            name: true,
            teamCode: true,
            joinCode: true,
            leaderUserId: true,
            memberCount: true,
          }
        }
      }
    });

    const teams = unparsedRegistrations
      .filter(reg => reg.event.participationMode === 'TEAM' && reg.team)
      .map(reg => ({
        eventId: reg.eventId,
        teamId: reg.teamId,
        teamName: reg.team!.name,
        teamCode: reg.team!.teamCode,
        joinCode: reg.team!.joinCode,
        isLeader: reg.team!.leaderUserId === session.userId,
        memberCount: reg.team!.memberCount,
        teamMaxSize: reg.event.teamMaxSize ?? 4 
      }));

    return NextResponse.json({ teams });
  } catch (error) {
    console.error("[GET /api/events/my-registrations]", error);
    return NextResponse.json({ teams: [] }, { status: 500 });
  }
}
