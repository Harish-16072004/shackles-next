import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { csvHeaderMap, parseCsv, readCsvField } from "@/lib/csv";

async function assertAdmin() {
  const session = await getSession();
  if (!session?.userId) return false;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  return user?.role === "ADMIN";
}

function normalizeName(name: string) {
  return name.trim().toUpperCase();
}

function toTeamSize(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

function toBool(value: string, fallback = false) {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export async function POST(request: Request) {
  const isAdmin = await assertAdmin();
  if (!isAdmin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "CSV file is required." }, { status: 400 });
  }

  const content = await file.text();
  const rows = parseCsv(content);
  if (rows.length < 2) {
    return Response.json({ error: "CSV has no data rows." }, { status: 400 });
  }

  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  const users = await prisma.user.findMany({ select: { id: true, email: true } });

  const eventByName = new Map(events.map((event) => [normalizeName(event.name), event.id]));
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.id]));

  const headerMap = csvHeaderMap(rows[0]);
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const eventName = readCsvField(row, headerMap, "eventName");
    const userEmail = readCsvField(row, headerMap, "userEmail").toLowerCase();

    if (!eventName || !userEmail) {
      skipped += 1;
      continue;
    }

    const eventId = eventByName.get(normalizeName(eventName));
    const userId = userByEmail.get(userEmail);

    if (!eventId || !userId) {
      skipped += 1;
      continue;
    }

    const attended = toBool(readCsvField(row, headerMap, "attended"), false);
    const attendedAtRaw = readCsvField(row, headerMap, "attendedAt");

    await prisma.eventRegistration.upsert({
      where: {
        userId_eventId: {
          userId,
          eventId,
        },
      },
      create: {
        userId,
        eventId,
        teamName: readCsvField(row, headerMap, "teamName") || null,
        teamSize: toTeamSize(readCsvField(row, headerMap, "teamSize")),
        attended,
        attendedAt: attendedAtRaw ? new Date(attendedAtRaw) : null,
      },
      update: {
        teamName: readCsvField(row, headerMap, "teamName") || null,
        teamSize: toTeamSize(readCsvField(row, headerMap, "teamSize")),
        attended,
        attendedAt: attendedAtRaw ? new Date(attendedAtRaw) : null,
      },
    });

    imported += 1;
  }

  revalidatePath("/admin/event-registrations");
  revalidatePath("/admin/events");
  revalidatePath("/admin/adminDashboard");
  revalidatePath("/userDashboard");
  revalidatePath("/events");
  revalidatePath("/workshops");

  return Response.json({ imported, skipped });
}
