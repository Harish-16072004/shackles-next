import { NextRequest } from "next/server";
import { leaderboardClients } from "@/lib/leaderboard-broadcast";

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId");
  if (!eventId) return new Response("eventId is required", { status: 400 });

  const stream = new ReadableStream({
    start(controller) {
      if (!leaderboardClients.has(eventId)) {
        leaderboardClients.set(eventId, new Set());
      }
      leaderboardClients.get(eventId)!.add(controller);

      // Keepalive ping every 25 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch (e) {
          clearInterval(keepalive);
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        leaderboardClients.get(eventId)?.delete(controller);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
