import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { stringifyCsvRow } from "@/lib/csv";

async function assertAdmin() {
  const session = await getSession();
  if (!session?.userId) return false;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  return user?.role === "ADMIN";
}

export async function GET() {
  const isAdmin = await assertAdmin();
  if (!isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const registrations = await prisma.eventRegistration.findMany({
    include: {
      event: true,
      user: true,
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
        registration.teamSize,
        registration.attended,
        registration.attendedAt ? registration.attendedAt.toISOString() : "",
      ])
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
