import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { stringifyCsvRow } from "@/lib/csv";
import { logAdminAudit } from "@/lib/admin-audit";
import { getActiveYear } from "@/lib/edition";

async function getAdminContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, email: user.email };
}

function toSafeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

export async function GET(request: Request) {
  const admin = await getAdminContext();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId")?.trim() || "";
  const activeYear = getActiveYear();

  const eventFilter = eventId
    ? await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, name: true } })
    : null;

  if (eventId && !eventFilter) {
    return new Response("Event not found", { status: 404 });
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: eventFilter
      ? { eventId: eventFilter.id }
      : {
          event: {
            year: activeYear,
            isArchived: false,
            isTemplate: false,
          },
        },
    include: {
      event: true,
      user: true,
      team: {
        include: {
          leader: {
            select: {
              shacklesId: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
    orderBy: [{ event: { name: "asc" } }, { user: { firstName: "asc" } }],
  });

  const lines = [
    stringifyCsvRow([
      "eventName",
      "eventType",
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
    ]),
    ...registrations.map((registration) =>
      stringifyCsvRow([
        registration.event.name,
        registration.event.type,
        registration.user.email,
        registration.user.firstName,
        registration.user.lastName,
        registration.teamName,
        registration.team?.status || "",
        registration.memberRole || "",
        registration.team?.leader?.shacklesId || "",
        registration.team?.leader ? `${registration.team.leader.firstName} ${registration.team.leader.lastName}`.trim() : "",
        registration.teamSize,
        registration.attended,
        registration.attendedAt ? registration.attendedAt.toISOString() : "",
      ])
    ),
  ];

  await logAdminAudit({
    action: "CSV_REGISTRATIONS_EXPORT",
    actorId: admin.id,
    actorEmail: admin.email,
    status: "SUCCESS",
    details: {
      rows: registrations.length,
      eventId: eventFilter?.id || null,
      eventName: eventFilter?.name || null,
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  const fileName = eventFilter
    ? `registrations-${toSafeSlug(eventFilter.name)}-${date}.csv`
    : `registrations-export-${date}.csv`;

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
