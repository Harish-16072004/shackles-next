import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { csvHeaderMap, parseCsv, readCsvField } from "@/lib/csv";
import { logAdminAudit } from "@/lib/admin-audit";
import { getActiveYear } from "@/lib/edition";
import { EventParticipationMode } from "@prisma/client";

async function getAdminContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, email: user.email };
}

function toInt(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function toBool(value: string, fallback = true) {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export async function POST(request: Request) {
  const admin = await getAdminContext();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const dryRun = String(formData.get("dryRun") || "").toLowerCase() === "true";

  if (!(file instanceof File)) {
    return Response.json({ error: "CSV file is required." }, { status: 400 });
  }

  const content = await file.text();
  const rows = parseCsv(content);
  if (rows.length < 2) {
    return Response.json({ error: "CSV has no data rows." }, { status: 400 });
  }

  const headerMap = csvHeaderMap(rows[0]);
  const activeYear = getActiveYear();
  let imported = 0;
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const name = readCsvField(row, headerMap, "name");
    if (!name) {
      skipped += 1;
      continue;
    }

    const type = readCsvField(row, headerMap, "type").toUpperCase() || null;
    const dayLabel = readCsvField(row, headerMap, "dayLabel").toUpperCase() || null;
    const dateRaw = readCsvField(row, headerMap, "date");
    const modeRaw = readCsvField(row, headerMap, "participationMode").toUpperCase();
    const yearRaw = readCsvField(row, headerMap, "year");
    const parsedYear = Number(yearRaw);
    const year = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 3000
      ? parsedYear
      : activeYear;
    const participationMode = modeRaw === "TEAM"
      ? EventParticipationMode.TEAM
      : EventParticipationMode.INDIVIDUAL;

    const teamMinSize = toInt(readCsvField(row, headerMap, "teamMinSize"));
    const teamMaxSize = toInt(readCsvField(row, headerMap, "teamMaxSize"));
    const maxTeams = toInt(readCsvField(row, headerMap, "maxTeams"));
    const maxParticipants = toInt(readCsvField(row, headerMap, "maxParticipants"));

    if (!dryRun) {
      const eventData = {
        year,
        type,
        dayLabel,
        date: dateRaw ? new Date(dateRaw) : null,
        description: readCsvField(row, headerMap, "description") || null,
        rulesUrl: readCsvField(row, headerMap, "rulesUrl") || null,
        coordinatorName: readCsvField(row, headerMap, "coordinatorName") || null,
        coordinatorPhone: readCsvField(row, headerMap, "coordinatorPhone") || null,
        trainerName: readCsvField(row, headerMap, "trainerName") || null,
        contactName: readCsvField(row, headerMap, "contactName") || null,
        contactPhone: readCsvField(row, headerMap, "contactPhone") || null,
        participationMode,
        teamMinSize: participationMode === "TEAM" ? teamMinSize : null,
        teamMaxSize: participationMode === "TEAM" ? teamMaxSize : null,
        maxTeams,
        maxParticipants,
        isActive: toBool(readCsvField(row, headerMap, "isActive"), true),
        isArchived: false,
        isTemplate: false,
        templateSourceId: null,
      };

      const existingEvent = await prisma.event.findFirst({
        where: { name, year },
        select: { id: true },
      });

      if (existingEvent) {
        await prisma.event.update({
          where: { id: existingEvent.id },
          data: eventData,
        });
      } else {
        await prisma.event.create({
          data: {
            name,
            ...eventData,
          },
        });
      }
    }

    imported += 1;
  }

  if (!dryRun) {
    revalidatePath("/admin/events");
    revalidatePath("/events");
    revalidatePath("/events/technical");
    revalidatePath("/events/non-technical");
    revalidatePath("/events/special");
    revalidatePath("/workshops");
  }

  await logAdminAudit({
    action: "CSV_EVENTS_IMPORT",
    actorId: admin.id,
    actorEmail: admin.email,
    status: "SUCCESS",
    details: { dryRun, imported, skipped },
  });

  return Response.json({ imported, skipped, dryRun });
}
