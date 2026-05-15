import { prisma } from "@/lib/prisma";

// Global map to track connected clients
// This map will be shared across the application if imported correctly
export const leaderboardClients = new Map<string, Set<ReadableStreamDefaultController>>();

/**
 * Broadcast an update to all clients watching a specific event's leaderboard.
 */
export async function broadcastLeaderboardUpdate(eventId: string) {
  const eventClients = leaderboardClients.get(eventId);
  if (!eventClients || eventClients.size === 0) return;

  // 1. Fetch the latest leaderboard data
  const criteria = await prisma.markingCriteria.findUnique({
    where: { eventId },
    include: {
      components: {
        orderBy: { order: 'asc' },
      },
      teamMarks: {
        where: { isSubmitted: true },
        include: {
          team: {
            select: { id: true, name: true, memberCount: true },
          },
          componentMarks: true,
        },
        orderBy: { totalMarks: 'desc' },
      },
    },
  });

  if (!criteria) return;

  const data = JSON.stringify({
    eventId,
    maxMarks: criteria.maxMarks,
    teams: criteria.teamMarks.map((tm, index) => ({
      rank: index + 1,
      teamId: tm.team.id,
      teamName: tm.team.name,
      totalMarks: Number(tm.totalMarks),
      componentMarks: tm.componentMarks.map(cm => ({
        componentId: cm.componentId,
        averageMarks: Number(cm.averageMarks),
      })),
    })),
  });

  // 2. Push to all clients
  const message = `data: ${data}\n\n`;
  const encoder = new TextEncoder();
  
  eventClients.forEach((controller) => {
    try {
      controller.enqueue(encoder.encode(message));
    } catch (e) {
      eventClients.delete(controller);
    }
  });
}
