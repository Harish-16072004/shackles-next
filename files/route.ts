import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth";

// In-memory registry of active SSE clients per event
// Key: eventId, Value: Set of response controllers
const clients = new Map<string, Set<ReadableStreamDefaultController>>();

// Called by the scoring Server Action after marks are saved
export function broadcastLeaderboardUpdate(eventId: string) {
  const eventClients = clients.get(eventId);
  if (!eventClients || eventClients.size === 0) return;

  // Fire-and-forget: fetch fresh leaderboard and push to all clients
  getLeaderboard(eventId).then((data) => {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    for (const controller of eventClients) {
      try {
        controller.enqueue(encoder.encode(payload));
      } catch {
        // Client disconnected mid-send; will be cleaned up on close
      }
    }
  });
}

async function getLeaderboard(eventId: string) {
  // Adjust the query to match your actual Prisma schema
  const entries = await prisma.eventScore.findMany({
    where: { eventId },
    include: {
      participant: { select: { id: true, name: true, shacklesId: true } },
      team: { select: { id: true, name: true } },
    },
    orderBy: { totalScore: "desc" },
  });

  return entries.map((entry, index) => ({
    rank: index + 1,
    participantId: entry.participant?.id ?? entry.team?.id,
    name: entry.participant?.name ?? entry.team?.name ?? "Unknown",
    shacklesId: entry.participant?.shacklesId ?? null,
    isTeam: !!entry.team,
    totalScore: entry.totalScore,
    breakdown: entry.breakdown, // JSON field with per-criteria scores
    updatedAt: entry.updatedAt,
  }));
}

export async function GET(request: NextRequest) {
  // --- Auth check ---
  const session = await verifyAuth(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");

  if (!eventId) {
    return new Response("Missing eventId", { status: 400 });
  }

  // --- SSE stream setup ---
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;

      // Register this client
      if (!clients.has(eventId)) {
        clients.set(eventId, new Set());
      }
      clients.get(eventId)!.add(controller);

      // Send initial snapshot immediately so the UI isn't blank
      getLeaderboard(eventId).then((data) => {
        const encoder = new TextEncoder();
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Already closed
        }
      });

      // Keepalive ping every 25s to prevent proxy/load-balancer timeouts
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 25_000);

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        clients.get(eventId)?.delete(controller);
        if (clients.get(eventId)?.size === 0) {
          clients.delete(eventId);
        }
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Required if your app sits behind Nginx
      "X-Accel-Buffering": "no",
    },
  });
}
