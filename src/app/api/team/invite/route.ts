import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { TeamStatus } from '@prisma/client';
import crypto from 'node:crypto';
import { sendTeamInviteEmail } from '@/lib/email';
import { z } from 'zod';

const InviteTeamSchema = z.object({
  teamId: z.string().cuid(),
  emails: z.array(z.string().email()).min(1),
});

function deriveLeaderName(firstName: string | null, lastName: string | null, fallbackEmail: string) {
  const name = [firstName, lastName].filter(Boolean).join(' ');
  return name.trim() || fallbackEmail;
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || !session.userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = InviteTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid input. Ensure emails are valid and not empty.' }, { status: 400 });
    }

    const { teamId, emails } = parsed.data;
    
    // Deduplicate and filter emails
    const uniqueEmails = Array.from(new Set(emails.map(e => e.trim().toLowerCase()).filter(Boolean)));
    if (uniqueEmails.length === 0) {
      return NextResponse.json({ ok: false, error: 'No valid emails provided.' }, { status: 400 });
    }

    // Load team
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        event: true,
      }
    });

    if (!team) {
      return NextResponse.json({ ok: false, error: 'Team not found.' }, { status: 404 });
    }

    // Check authorization: must be leader, admin or coordinator
    const isLeader = team.leaderUserId === session.userId;
    const isAdmin = session.role === 'ADMIN' || session.role === 'COORDINATOR'; // Assuming session role applies here
    if (!isLeader && !isAdmin) {
      return NextResponse.json({ ok: false, error: 'Only the team leader or an admin can invite members.' }, { status: 403 });
    }

    // Check team status
    if (team.status !== TeamStatus.OPEN && team.status !== TeamStatus.DRAFT) {
      return NextResponse.json({ ok: false, error: 'Cannot invite members to a team that is not OPEN or DRAFT.' }, { status: 403 });
    }

    // Check capacity
    const maxSize = team.event.teamMaxSize ?? 4;
    const remaining = maxSize - team.memberCount;
    
    if (uniqueEmails.length > remaining) {
      return NextResponse.json({ 
        ok: false, 
        error: \`You can only invite \${remaining} more member(s).\` 
      }, { status: 400 });
    }

    const requestingUser = await prisma.user.findUnique({ where: { id: session.userId }});
    const leaderName = deriveLeaderName(requestingUser?.firstName || null, requestingUser?.lastName || null, requestingUser?.email || "Unknown");

    // Generate invites and send emails
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const results = await Promise.allSettled(uniqueEmails.map(async (email) => {
      const inviteToken = crypto.randomBytes(24).toString("hex");

      await prisma.teamInvite.create({
        data: {
          teamId: team.id,
          token: inviteToken,
          invitedEmail: email,
          invitedByUserId: session.userId,
          expiresAt,
        },
      });

      const invitePayload = {
        toEmail: email,
        leaderName,
        eventName: team.event.name,
        teamName: team.name,
        teamCode: team.teamCode,
        inviteToken,
        expiresAt,
      };

      return sendTeamInviteEmail(invitePayload);
    }));

    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
    
    if (failed.length > 0 && failed.length === uniqueEmails.length) {
       return NextResponse.json({ ok: false, error: 'Failed to send invite emails.' }, { status: 500 });
    }

    return NextResponse.json({ 
      ok: true, 
      message: \`Successfully sent \${uniqueEmails.length - failed.length} invite(s).\` 
    });

  } catch (error) {
    console.error("[POST /api/team/invite] Error:", error);
    return NextResponse.json({ ok: false, error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
