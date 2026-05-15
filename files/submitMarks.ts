"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { broadcastLeaderboardUpdate } from "@/app/api/leaderboard/stream/route";
import { z } from "zod";

const SubmitMarksSchema = z.object({
  eventId: z.string().cuid(),
  participantId: z.string().cuid().optional(),
  teamId: z.string().cuid().optional(),
  criteria: z.record(z.string(), z.number().min(0).max(100)),
});

export type SubmitMarksInput = z.infer<typeof SubmitMarksSchema>;

export async function submitMarks(input: SubmitMarksInput) {
  // Only coordinators and admins can submit marks
  const session = await requireRole(["COORDINATOR", "ADMIN"]);

  const parsed = SubmitMarksSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid input" };
  }

  const { eventId, participantId, teamId, criteria } = parsed.data;

  if (!participantId && !teamId) {
    return { success: false, error: "Either participantId or teamId required" };
  }

  const totalScore = Object.values(criteria).reduce((a, b) => a + b, 0);

  // Upsert so re-submissions overwrite cleanly
  await prisma.eventScore.upsert({
    where: {
      // Unique constraint on (eventId, participantId) or (eventId, teamId)
      eventId_participantId: participantId
        ? { eventId, participantId }
        : undefined,
      eventId_teamId: teamId ? { eventId, teamId } : undefined,
    },
    update: {
      totalScore,
      breakdown: criteria,
      submittedBy: session.userId,
      updatedAt: new Date(),
    },
    create: {
      eventId,
      participantId: participantId ?? null,
      teamId: teamId ?? null,
      totalScore,
      breakdown: criteria,
      submittedBy: session.userId,
    },
  });

  // Push the updated leaderboard to all connected SSE clients instantly
  broadcastLeaderboardUpdate(eventId);

  return { success: true };
}
