import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { csvHeaderMap, parseCsv, readCsvField } from "@/lib/csv";
import { logAdminAudit } from "@/lib/admin-audit";
import { getActiveYear } from "@/lib/edition";
import { createRateLimiter } from "@/lib/rate-limit";
import { EventParticipationMode, type Prisma } from "@prisma/client";

const eventsImportRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 50,
  keyPrefix: "api:admin:csv:events:import",
});

async function getAdminContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, email: user.email };
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

function toPositiveInt(value: string, label: string, errors: string[]) {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    errors.push(`${label} must be a positive number.`);
    return null;
  }
  return Math.trunc(parsed);
}

function toBool(value: string, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function hasCsvField(headerMap: Map<string, number>, aliases: string[]) {
  return aliases.some((alias) => headerMap.has(alias.toLowerCase()));
}

function readFirstCsvField(row: string[], headerMap: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const value = readCsvField(row, headerMap, alias);
    if (value) return value;
  }
  return "";
}

function normalizeDateStr(value: string) {
  // Check for DD/MM/YYYY or MM/DD/YYYY formats
  const match = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) {
    const part1 = parseInt(match[1]);
    const part2 = parseInt(match[2]);
    let day = match[1].padStart(2, "0");
    let month = match[2].padStart(2, "0");
    
    // If middle part > 12, it must be the day (MM/DD/YYYY)
    if (part2 > 12) {
      day = match[2].padStart(2, "0");
      month = match[1].padStart(2, "0");
    } 
    // Else assume DD/MM/YYYY by default
    
    return `${match[3]}-${month}-${day}`;
  }
  return value;
}

function datePart(value: string) {
  return value.trim().split(/[ T]/)[0] || value;
}

function timePart(value: string) {
  const parts = value.trim().split(/[ T]/);
  return parts.slice(1).join(" ") || "";
}

function combineDateAndTime(dateValue: string, timeValue: string) {
  if (!dateValue) return "";
  
  const dPart = normalizeDateStr(datePart(dateValue));
  const tPart = timeValue ? timeValue.trim() : timePart(dateValue);

  if (tPart) {
    // A space separator natively parses time cleanly in V8, e.g., "YYYY-MM-DD 9:00"
    return `${dPart} ${tPart}`;
  }
  return dPart;
}

function parseDateValue(value: string, label: string, errors: string[]) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    errors.push(`${label} is not a valid date/time.`);
    return null;
  }
  return parsed;
}

function parseYear(value: string, activeYear: number, headerMap: Map<string, number>, errors: string[]) {
  if (!hasCsvField(headerMap, ["year", "eventYear"])) return activeYear;
  if (!value) return activeYear;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 3000) {
    errors.push("year must be a valid year between 2000 and 3000.");
    return activeYear;
  }

  return parsed;
}

function parseParticipationMode(value: string, errors: string[]) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return EventParticipationMode.INDIVIDUAL;
  if (normalized === "TEAM") return EventParticipationMode.TEAM;
  if (normalized === "INDIVIDUAL") return EventParticipationMode.INDIVIDUAL;

  errors.push("participationMode must be TEAM or INDIVIDUAL.");
  return EventParticipationMode.INDIVIDUAL;
}

function readPositiveInt(
  row: string[],
  headerMap: Map<string, number>,
  aliases: string[],
  label: string,
  errors: string[]
) {
  return toPositiveInt(readFirstCsvField(row, headerMap, aliases), label, errors);
}

function buildEventData(
  row: string[],
  headerMap: Map<string, number>,
  activeYear: number,
  errors: string[]
) {
  const type = readFirstCsvField(row, headerMap, ["type", "eventType"]).toUpperCase() || null;
  const dayLabel = readFirstCsvField(row, headerMap, ["dayLabel", "eventDay", "day"]).toUpperCase() || null;
  const dateRaw = readFirstCsvField(row, headerMap, ["date", "eventDate", "startDate", "eventStartDate", "eventDateTime", "startDateTime"]);
  const timeRaw = readFirstCsvField(row, headerMap, ["time", "eventTime", "startTime", "eventStartTime"]);
  const endDateRaw = readFirstCsvField(row, headerMap, ["endDate", "eventEndDate", "eventEndDateTime"]);
  const endTimeRaw = readFirstCsvField(row, headerMap, ["endTime", "eventEndTime"]);
  const year = parseYear(
    readFirstCsvField(row, headerMap, ["year", "eventYear"]),
    activeYear,
    headerMap,
    errors
  );
  const participationMode = parseParticipationMode(
    readFirstCsvField(row, headerMap, ["participationMode", "mode"]),
    errors
  );

  const dateKeys = ["date", "eventDate", "startDate", "eventStartDate", "eventDateTime", "startDateTime", "time", "eventTime", "startTime", "eventStartTime"];
  const endDateKeys = ["endDate", "eventEndDate", "eventEndDateTime", "endTime", "eventEndTime"];
  const hasDateInput = hasCsvField(headerMap, dateKeys);
  const hasEndDateInput = hasCsvField(headerMap, endDateKeys);

  if (timeRaw && !dateRaw) {
    errors.push("date/eventDate is required when time/eventTime is provided.");
  }

  const effectiveEndDateRaw = endDateRaw || (endTimeRaw && dateRaw ? datePart(dateRaw) : "");
  if (endTimeRaw && !effectiveEndDateRaw) {
    errors.push("endDate/eventEndDate or date/eventDate is required when endTime/eventEndTime is provided.");
  }

  const date = hasDateInput && dateRaw
    ? parseDateValue(combineDateAndTime(dateRaw, timeRaw), "date/time", errors)
    : null;
  const endDate = hasEndDateInput && effectiveEndDateRaw
    ? parseDateValue(combineDateAndTime(effectiveEndDateRaw, endTimeRaw), "endDate/endTime", errors)
    : null;

  if (date && endDate && endDate < date) {
    errors.push("endDate/endTime cannot be before date/time.");
  }

  const teamMinSize = readPositiveInt(
    row,
    headerMap,
    ["teamMinSize", "minTeamSize", "minParticipants", "minTeamParticipants", "minimumTeamParticipants", "minTeams", "minimumTeams"],
    "teamMinSize",
    errors
  );
  const teamMaxSize = readPositiveInt(
    row,
    headerMap,
    ["teamMaxSize", "maxTeamSize", "maxTeamParticipants", "maximumTeamParticipants", "maxParticipantsPerTeam"],
    "teamMaxSize",
    errors
  );
  const maxTeams = readPositiveInt(
    row,
    headerMap,
    ["maxTeams", "maxTeam", "teamLimit", "maximumTeams"],
    "maxTeams",
    errors
  );
  const maxParticipants = readPositiveInt(
    row,
    headerMap,
    ["maxParticipants", "maxParticipant", "participantLimit", "maximumParticipants", "maxEventParticipants"],
    "maxParticipants",
    errors
  );

  if (teamMinSize != null && teamMaxSize != null && teamMinSize > teamMaxSize) {
    errors.push("teamMinSize cannot be greater than teamMaxSize.");
  }

  const isAllDayProvided = hasCsvField(headerMap, ["isAllDay", "allDay"]);
  const isActiveProvided = hasCsvField(headerMap, ["isActive", "active"]);

  const eventData: Prisma.EventUncheckedCreateInput = {
    name: "",
    year,
    type,
    dayLabel,
    ...(hasDateInput ? { date } : {}),
    ...(hasEndDateInput ? { endDate } : {}),
    description: readFirstCsvField(row, headerMap, ["description", "eventDescription"]) || null,
    rulesUrl: readFirstCsvField(row, headerMap, ["rulesUrl", "rulesURL", "rulesLink"]) || null,
    coordinatorName: readFirstCsvField(row, headerMap, ["coordinatorName", "coordinator"]) || null,
    coordinatorPhone: readFirstCsvField(row, headerMap, ["coordinatorPhone", "coordinatorMobile"]) || null,
    trainerName: readFirstCsvField(row, headerMap, ["trainerName", "trainer"]) || null,
    contactName: readFirstCsvField(row, headerMap, ["contactName", "contactPerson"]) || null,
    contactPhone: readFirstCsvField(row, headerMap, ["contactPhone", "contactMobile"]) || null,
    participationMode,
    teamMinSize: participationMode === EventParticipationMode.TEAM ? teamMinSize : null,
    teamMaxSize: participationMode === EventParticipationMode.TEAM ? teamMaxSize : null,
    maxTeams,
    maxParticipants,
    ...(isAllDayProvided ? { isAllDay: toBool(readFirstCsvField(row, headerMap, ["isAllDay", "allDay"]), false) } : {}),
    isActive: isActiveProvided
      ? toBool(readFirstCsvField(row, headerMap, ["isActive", "active"]), true)
      : true,
    isArchived: false,
    isTemplate: false,
    templateSourceId: null,
  };

  return eventData;
}

export async function POST(request: Request) {
  const admin = await getAdminContext();
  if (!admin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await eventsImportRateLimiter.limit(`admin:csv:events:import:${admin.id}`);
  if (!rateLimitResult.success) {
    return Response.json({ error: "Rate limit exceeded. Please try again later." }, { status: 429 });
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
  const errors: string[] = [];

  for (const [rowIndex, row] of rows.slice(1).entries()) {
    const rowNumber = rowIndex + 2;
    const rowErrors: string[] = [];
    const name = readFirstCsvField(row, headerMap, ["name", "eventName"]).trim();
    if (!name) {
      skipped += 1;
      errors.push(`Row ${rowNumber}: name/eventName is required.`);
      continue;
    }

    const eventData = buildEventData(row, headerMap, activeYear, rowErrors);
    eventData.name = name;
    if (rowErrors.length > 0) {
      skipped += 1;
      errors.push(...rowErrors.map((error) => `Row ${rowNumber}: ${error}`));
      continue;
    }

    if (!dryRun) {
      const existingEvents = await prisma.event.findMany({
        where: { year: eventData.year },
        select: { id: true, name: true },
      });
      const existingEvent = existingEvents.find((event) => normalizeName(event.name) === normalizeName(name));

      if (existingEvent) {
        await prisma.event.update({
          where: { id: existingEvent.id },
          data: {
            ...eventData,
            name: undefined,
          },
        });
      } else {
        await prisma.event.create({
          data: eventData,
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
    details: { dryRun, imported, skipped, errors: errors.slice(0, 20) },
  });

  return Response.json({ imported, skipped, dryRun, errors });
}
