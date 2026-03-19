import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { csvHeaderMap, parseCsv, readCsvField } from "@/lib/csv";
import { logAdminAudit } from "@/lib/admin-audit";

async function getAdminContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, email: user.email };
}

function normalizeName(name: string) {
  return name.trim().toUpperCase();
}

function normalizeTeamName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
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

function parseTeamStatus(value: string): "DRAFT" | "COMPLETED" | "LOCKED" | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "DRAFT" || normalized === "COMPLETED" || normalized === "LOCKED") return normalized;
  return null;
}

function parseMemberRole(value: string): "LEADER" | "MEMBER" | null {
  const normalized = value.trim().toUpperCase();
  if (normalized === "LEADER" || normalized === "MEMBER") return normalized;
  return null;
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

  const events = await prisma.event.findMany({ select: { id: true, name: true } });
  const users = await prisma.user.findMany({ select: { id: true, email: true, phone: true } });

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
    const rawTeamName = readCsvField(row, headerMap, "teamName").trim();
    const rawTeamStatus = parseTeamStatus(readCsvField(row, headerMap, "teamStatus"));
    const rawMemberRole = parseMemberRole(readCsvField(row, headerMap, "memberRole"));

    if (!dryRun) {
      const event = events.find((item) => item.id === eventId);
      if (!event) {
        skipped += 1;
        continue;
      }

      let teamId: string | null = null;
      if (event && eventId && rawTeamName && eventByName.get(normalizeName(event.name)) === eventId) {
        const teamStatus = rawTeamStatus || "DRAFT";
        const normalizedTeam = normalizeTeamName(rawTeamName);
        const userRecord = users.find((u) => u.id === userId);

        const team = await prisma.team.upsert({
          where: {
            eventId_nameNormalized: {
              eventId,
              nameNormalized: normalizedTeam,
            },
          },
          create: {
            eventId,
            name: rawTeamName,
            nameNormalized: normalizedTeam,
            teamCode: crypto.randomBytes(4).toString("hex").toUpperCase(),
            memberCount: 0,
            status: teamStatus,
            leaderUserId: rawMemberRole === "LEADER" ? userId : null,
            leaderContactPhoneSnapshot: rawMemberRole === "LEADER" ? userRecord?.phone || null : null,
            leaderContactEmailSnapshot: rawMemberRole === "LEADER" ? userRecord?.email || null : null,
          },
          update: {
            status: teamStatus,
            leaderUserId: rawMemberRole === "LEADER" ? userId : undefined,
            leaderContactPhoneSnapshot: rawMemberRole === "LEADER" ? userRecord?.phone || null : undefined,
            leaderContactEmailSnapshot: rawMemberRole === "LEADER" ? userRecord?.email || null : undefined,
          },
        });

        teamId = team.id;
      }

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
          teamId,
          memberRole: rawMemberRole,
          teamName: rawTeamName || null,
          teamSize: toTeamSize(readCsvField(row, headerMap, "teamSize")),
          attended,
          attendedAt: attendedAtRaw ? new Date(attendedAtRaw) : null,
        },
        update: {
          teamId,
          memberRole: rawMemberRole,
          teamName: rawTeamName || null,
          teamSize: toTeamSize(readCsvField(row, headerMap, "teamSize")),
          attended,
          attendedAt: attendedAtRaw ? new Date(attendedAtRaw) : null,
        },
      });
    }

    imported += 1;
  }

  if (!dryRun) {
    const teams = await prisma.team.findMany({
      select: { id: true },
    });

    for (const team of teams) {
      const count = await prisma.eventRegistration.count({
        where: { teamId: team.id },
      });

      await prisma.team.update({
        where: { id: team.id },
        data: { memberCount: count },
      });
    }
  }

  if (!dryRun) {
    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/events");
    revalidatePath("/admin/adminDashboard");
    revalidatePath("/userDashboard");
    revalidatePath("/events");
    revalidatePath("/workshops");
  }

  await logAdminAudit({
    action: "CSV_REGISTRATIONS_IMPORT",
    actorId: admin.id,
    actorEmail: admin.email,
    status: "SUCCESS",
    details: { dryRun, imported, skipped },
  });

  return Response.json({ imported, skipped, dryRun });
}
