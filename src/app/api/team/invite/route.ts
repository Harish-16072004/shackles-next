// src/app/api/team/invite/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { TeamStatus } from "@prisma/client";
import crypto from "node:crypto";
import { sendTeamInviteEmail } from "@/lib/email";
import { createRateLimiter, rateLimitPresets } from "@/lib/rate-limit";
import { z } from "zod";

const InviteBodySchema = z.object({
  eventId: z.string().min(1),
  teamCode: z.string().min(1),
  emails: z.array(z.string().email()).min(1).max(10),
});

const inviteRateLimiter = createRateLimiter({
  ...rateLimitPresets.registration,
  keyPrefix: "api:team:invite",
});

function deriveLeaderName(
  firstName: string | null,
  lastName: string | null,
  fallback: string
) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

export async function POST(req: Request) {
  try {
    // Auth
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    // Rate limit
    const rl = await inviteRateLimiter.limit(`team:invite:${session.userId}`);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many invite attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Validate body
    const body = await req.json().catch(() => ({}));
    const parsed = InviteBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input. Provide eventId, teamCode, and valid emails." },
        { status: 400 }
      );
    }

    const { eventId, teamCode, emails } = parsed.data;
    const uniqueEmails = Array.from(
      new Set(emails.map((e) => e.trim().toLowerCase()))
    );

    // Load team by eventId + teamCode (indexed unique key — no internal id needed)
    const team = await prisma.team.findUnique({
      where: { eventId_teamCode: { eventId, teamCode: teamCode.toUpperCase() } },
      include: { event: { select: { name: true, teamMaxSize: true } } },
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    // Authorization: leader or admin/coordinator via DB role
    if (team.leaderUserId !== session.userId) {
      const requestor = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { role: true },
      });
      if (!requestor || !["ADMIN", "COORDINATOR"].includes(requestor.role)) {
        return NextResponse.json(
          { error: "Only the team leader or an admin can invite members." },
          { status: 403 }
        );
      }
    }

    // Team must still be open
    if (team.status !== TeamStatus.OPEN && team.status !== TeamStatus.DRAFT) {
      return NextResponse.json(
        { error: "This team is locked and no longer accepting members." },
        { status: 409 }
      );
    }

    // Capacity check
    const maxSize = team.event.teamMaxSize ?? 4;
    const remaining = maxSize - team.memberCount;
    if (uniqueEmails.length > remaining) {
      return NextResponse.json(
        { error: `Only ${remaining} slot(s) remaining. Reduce the number of invites.` },
        { status: 400 }
      );
    }

    // Skip emails already registered for the event
    const alreadyRegistered = await prisma.eventRegistration.findMany({
      where: {
        eventId,
        user: { email: { in: uniqueEmails } },
      },
      select: { user: { select: { email: true } } },
    });
    const registeredEmails = new Set(
      alreadyRegistered.map((r) => r.user.email.toLowerCase())
    );

    // Skip emails with a still-valid pending invite
    const existingInvites = await prisma.teamInvite.findMany({
      where: {
        teamId: team.id,
        invitedEmail: { in: uniqueEmails },
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { invitedEmail: true },
    });
    const pendingEmails = new Set(
      existingInvites.map((i) => i.invitedEmail?.toLowerCase()).filter(Boolean) as string[]
    );

    const toInvite = uniqueEmails.filter(
      (e) => !registeredEmails.has(e) && !pendingEmails.has(e)
    );

    if (toInvite.length === 0) {
      return NextResponse.json(
        { error: "All provided emails are already registered or have a pending invite." },
        { status: 409 }
      );
    }

    // Fetch leader name for email template
    const requestingUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const leaderName = deriveLeaderName(
      requestingUser?.firstName ?? null,
      requestingUser?.lastName ?? null,
      requestingUser?.email ?? "Team Leader"
    );

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create invite records first (all in one transaction), then send emails
    const inviteTokenMap = new Map<string, string>();
    await prisma.$transaction(
      toInvite.map((email) => {
        const token = crypto.randomBytes(24).toString("hex");
        inviteTokenMap.set(email, token);
        return prisma.teamInvite.create({
          data: {
            teamId: team.id,
            token,
            invitedEmail: email,
            invitedByUserId: session.userId,
            expiresAt,
          },
        });
      })
    );

    // Send emails after DB writes are committed
    const results = await Promise.allSettled(
      toInvite.map((email) =>
        sendTeamInviteEmail({
          toEmail: email,
          leaderName,
          eventName: team.event.name,
          teamName: team.name,
          teamCode: team.teamCode,
          inviteToken: inviteTokenMap.get(email)!,
          expiresAt,
        })
      )
    );

    const failedCount = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)
    ).length;
    const sentCount = toInvite.length - failedCount;

    if (sentCount === 0) {
      return NextResponse.json(
        { error: "Invite records created but all emails failed to send." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: `Sent ${sentCount} invite(s) successfully.${
        failedCount > 0 ? ` ${failedCount} failed.` : ""
      }`,
      sentCount,
      failedCount,
      skipped: uniqueEmails.length - toInvite.length,
    });
  } catch (error) {
    console.error("[POST /api/team/invite]", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}