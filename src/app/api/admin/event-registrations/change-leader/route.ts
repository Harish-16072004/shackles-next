import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";

const rateLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 30,
    keyPrefix: "api:admin:event-registrations:change-leader",
});

async function getAdminUserId() {
    const session = await getSession();
    if (!session?.userId) return null;
    const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
    return user?.role === "ADMIN" ? user.id : null;
}

export async function POST(request: Request) {
    const adminUserId = await getAdminUserId();
    if (!adminUserId) return new Response("Unauthorized", { status: 401 });

    const rl = await rateLimiter.limit(`admin:change-leader:${adminUserId}`);
    if (!rl.success) {
        const retryAfter = Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000));
        return Response.json(
            { error: "Too many attempts. Please try again later." },
            {
                status: 429,
                headers: {
                    "x-ratelimit-limit": "30",
                    "x-ratelimit-remaining": String(rl.remaining),
                    "x-ratelimit-reset": String(rl.reset),
                    "retry-after": String(retryAfter),
                },
            }
        );
    }

    const formData = await request.formData();
    const teamId = String(formData.get("teamId") || "").trim();
    const newLeaderUserId = String(formData.get("newLeaderUserId") || "").trim();
    const eventId = String(formData.get("eventId") || "").trim();

    if (!teamId || !newLeaderUserId || !eventId) {
        return Response.redirect(
            new URL(`/admin/event-registrations/${eventId}?error=missing-fields`, request.url), 303
        );
    }

    // Verify team exists and new leader is actually a member of that team
    const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { id: true, leaderUserId: true, members: { select: { userId: true } } },
    });

    if (!team) {
        return Response.redirect(
            new URL(`/admin/event-registrations/${eventId}?error=team-not-found`, request.url), 303
        );
    }

    const isMember = team.members.some((m) => m.userId === newLeaderUserId);
    if (!isMember) {
        return Response.redirect(
            new URL(`/admin/event-registrations/${eventId}?error=not-a-member`, request.url), 303
        );
    }

    if (team.leaderUserId === newLeaderUserId) {
        return Response.redirect(
            new URL(`/admin/event-registrations/${eventId}?error=already-leader`, request.url), 303
        );
    }

    // Atomic: demote old leader → promote new leader → update Team.leaderUserId
    await prisma.$transaction([
        // Demote current leader to MEMBER
        prisma.eventRegistration.updateMany({
            where: { teamId, userId: team.leaderUserId ?? "" },
            data: { memberRole: "MEMBER" },
        }),
        // Promote new leader
        prisma.eventRegistration.updateMany({
            where: { teamId, userId: newLeaderUserId },
            data: { memberRole: "LEADER" },
        }),
        // Update Team record
        prisma.team.update({
            where: { id: teamId },
            data: {
                leaderUserId: newLeaderUserId,
                // Snapshots are informational; update them to reflect the change
                leaderContactEmailSnapshot: undefined, // let Prisma keep existing or clear as needed
            },
        }),
    ]);

    revalidatePath("/admin/event-registrations");
    revalidatePath(`/admin/event-registrations/${eventId}`);

    return Response.redirect(
        new URL(`/admin/event-registrations/${eventId}?success=leader-changed`, request.url), 303
    );
}