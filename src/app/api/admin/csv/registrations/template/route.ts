import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { stringifyCsvRow } from "@/lib/csv";
import { createRateLimiter } from "@/lib/rate-limit";

const templateRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 100,
  keyPrefix: "api:admin:csv:registrations:template",
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: String(session.userId) },
    select: { id: true, role: true, email: true },
  });
  if (!user || user.role !== "ADMIN") {
    return new Response("Unauthorized", { status: 401 });
  }

  const rateLimitResult = await templateRateLimiter.limit(`admin:csv:registrations:template:${user.id}`);
  if (!rateLimitResult.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    return Response.json(
      { error: "Too many template requests. Please try again later." },
      {
        status: 429,
        headers: {
          "x-ratelimit-limit": "100",
          "x-ratelimit-remaining": String(rateLimitResult.remaining),
          "x-ratelimit-reset": String(rateLimitResult.reset),
          "retry-after": String(retryAfterSeconds),
        },
      }
    );
  }

  const headers = [
    "eventName",
    "eventType",
    "eventYear",
    "dayLabel",
    "eventDate",
    "eventTime",
    "eventEndDate",
    "eventEndTime",
    "isAllDay",
    "participationMode",
    "teamMinSize",
    "teamMaxSize",
    "maxTeams",
    "maxParticipants",
    "userEmail",
    "userFirstName",
    "userLastName",
    "teamName",
    "teamStatus",
    "memberRole",
    "teamLeaderShacklesId",
    "teamLeaderName",
    "teamSize",
    "attended",
    "attendedAt",
  ];

  const date = new Date().toISOString().slice(0, 10);
  const fileName = `registrations-template-${date}.csv`;

  return new Response(stringifyCsvRow(headers), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(`${fileName}`)}`,
      "Cache-Control": "no-store",
    },
  });
}
