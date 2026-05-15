'use server'

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { EventParticipationMode } from "@prisma/client";
import { logAdminAudit } from "@/lib/admin-audit";
import { getActiveYear } from "@/lib/edition";
import { archiveEventById, restoreEventById } from "@/server/services/event-archive.service";
import { normalizeIndianPhone } from "@/lib/validation/phone";



function toOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}



function parseCoordinators(formData: FormData) {
  const entries = [1, 2, 3].map((index) => ({
    name: (formData.get(`coordinatorName${index}`) as string | null)?.trim() || "",
    phone: (formData.get(`coordinatorPhone${index}`) as string | null)?.trim() || "",
  }));

  for (const entry of entries) {
    if (entry.name || entry.phone) {
      if (!entry.name || !entry.phone) return null;
      const normalized = normalizeIndianPhone(entry.phone);
      if (!normalized) return null;
      entry.phone = normalized;
    }
  }

  const normalized = entries.filter((entry) => entry.name && entry.phone);
  if (normalized.length === 0) return null;

  return {
    coordinatorName: normalized.map((entry) => entry.name).join(" | "),
    coordinatorPhone: normalized.map((entry) => entry.phone).join(" | "),
  };
}

export async function assertAdmin() {
  const session = await getSession();
  if (!session?.userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!user || user.role !== "ADMIN") redirect("/login");
  return user;
}

function revalidateEventPaths() {
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/events/technical");
  revalidatePath("/events/non-technical");
  revalidatePath("/events/special");
  revalidatePath("/workshops");
}

export async function archiveEventAction(formData: FormData) {
  'use server'
  const admin = await assertAdmin();

  const eventId = (formData.get("eventId") as string | null)?.trim();
  if (!eventId) return;

  await archiveEventById(prisma, eventId);

  revalidateEventPaths();
  revalidatePath("/admin/event-registrations");
  revalidatePath("/admin/adminDashboard");

  await logAdminAudit({
    action: "EVENT_ARCHIVE",
    actorId: admin.id,
    actorEmail: admin.email,
    target: eventId,
    status: "SUCCESS",
  });

  const year = (formData.get("year") as string | null)?.trim();
  const selectedYear = year || String(getActiveYear());
  redirect(`/admin/events?year=${encodeURIComponent(selectedYear)}&formReset=${Date.now()}`);
}

export async function restoreEventAction(formData: FormData) {
  'use server'
  const admin = await assertAdmin();

  const eventId = (formData.get("eventId") as string | null)?.trim();
  if (!eventId) return;

  await restoreEventById(prisma, eventId);

  revalidateEventPaths();
  revalidatePath("/admin/event-registrations");
  revalidatePath("/admin/adminDashboard");

  await logAdminAudit({
    action: "EVENT_RESTORE",
    actorId: admin.id,
    actorEmail: admin.email,
    target: eventId,
    status: "SUCCESS",
  });

  const year = (formData.get("year") as string | null)?.trim();
  const selectedYear = year || String(getActiveYear());
  redirect(`/admin/events?year=${encodeURIComponent(selectedYear)}&showArchived=true&formReset=${Date.now()}`);
}

export async function updateEventAction(formData: FormData) {
  'use server'
  const admin = await assertAdmin();

  const eventId = (formData.get("eventId") as string | null)?.trim();
  const yearRaw = (formData.get("year") as string | null)?.trim();
  const name = (formData.get("name") as string | null)?.trim();
  const typeRaw = (formData.get("type") as string | null)?.trim();
  const dayLabelRaw = (formData.get("dayLabel") as string | null)?.trim();
  const dateRaw = (formData.get("date") as string | null)?.trim();
  const endDateRaw = (formData.get("endDate") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const rulesUrl = (formData.get("rulesUrl") as string | null)?.trim() || null;
  const coordinatorDetails = parseCoordinators(formData);
  const participationModeRaw = (formData.get("participationMode") as string | null)?.trim();
  const categoryRaw = (formData.get("category") as string | null)?.trim();
  const trainerName = (formData.get("trainerName") as string | null)?.trim() || null;
  const isActiveRaw = formData.get("isActive") as string | null;
  const isAllDayRaw = formData.get("isAllDay") as string | null;

  if (!eventId || !name) return;
  if (!coordinatorDetails) return;

  const type = typeRaw ? typeRaw.toUpperCase() : null;
  const category = categoryRaw ? (categoryRaw.toUpperCase() as "EVENT" | "WORKSHOP") : "EVENT";
  const dayLabel = dayLabelRaw ? dayLabelRaw.toUpperCase() : null;
  const participationMode = participationModeRaw === "TEAM"
    ? EventParticipationMode.TEAM
    : EventParticipationMode.INDIVIDUAL;
  const maxParticipants = toOptionalNumber(formData.get("maxParticipants"));
  const maxTeams = toOptionalNumber(formData.get("maxTeams"));
  const teamMinSize = toOptionalNumber(formData.get("teamMinSize"));
  const teamMaxSize = toOptionalNumber(formData.get("teamMaxSize"));
  const date = dateRaw ? new Date(dateRaw) : null;
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const isActive = isActiveRaw === "on";
  const isAllDay = isAllDayRaw === "on";
  const year = Number(yearRaw);

  if ((date && Number.isNaN(date.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) return;
  if (date && endDate && endDate < date) return;
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return;

  if (maxParticipants != null && maxParticipants < 1) return;
  if (maxTeams != null && maxTeams < 1) return;

  if (participationMode === "TEAM") {
    if (teamMinSize != null && teamMinSize < 1) return;
    if (teamMaxSize != null && teamMaxSize < 1) return;
    if (teamMinSize != null && teamMaxSize != null && teamMinSize > teamMaxSize) return;
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      name,
      year,
      type,
      dayLabel,
      date,
      endDate,
      description,
      rulesUrl,
      coordinatorName: coordinatorDetails.coordinatorName,
      coordinatorPhone: coordinatorDetails.coordinatorPhone,
      category,
      trainerName,
      contactName: null,
      contactPhone: null,
      participationMode,
      isAllDay,
      teamMinSize: participationMode === "TEAM" ? teamMinSize : null,
      teamMaxSize: participationMode === "TEAM" ? teamMaxSize : null,
      maxTeams,
      maxParticipants,
      isActive,
    },
  });

  revalidateEventPaths();

  await logAdminAudit({
    action: "EVENT_UPDATE",
    actorId: admin.id,
    actorEmail: admin.email,
    target: eventId,
    status: "SUCCESS",
    details: {
      name,
      participationMode,
      maxParticipants,
      maxTeams,
      isActive,
    },
  });

  redirect(`/admin/events?year=${encodeURIComponent(String(year))}`);
}

export async function createEventAction(formData: FormData) {
  'use server'
  const user = await assertAdmin();

  const name = (formData.get("name") as string | null)?.trim();
  const yearRaw = (formData.get("year") as string | null)?.trim();
  const typeRaw = (formData.get("type") as string | null)?.trim();
  const dayLabelRaw = (formData.get("dayLabel") as string | null)?.trim();
  const type = typeRaw ? typeRaw.toUpperCase() : null;
  const dayLabel = dayLabelRaw ? dayLabelRaw.toUpperCase() : null;
  const dateRaw = (formData.get("date") as string | null)?.trim();
  const endDateRaw = (formData.get("endDate") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const rulesUrl = (formData.get("rulesUrl") as string | null)?.trim() || null;
  const coordinatorDetails = parseCoordinators(formData);
  const participationModeRaw = (formData.get("participationMode") as string | null)?.trim();
  const participationMode = participationModeRaw === "TEAM"
    ? EventParticipationMode.TEAM
    : EventParticipationMode.INDIVIDUAL;
  const categoryRaw = (formData.get("category") as string | null)?.trim();
  const trainerName = (formData.get("trainerName") as string | null)?.trim() || null;
  const maxParticipantsRaw = (formData.get("maxParticipants") as string | null)?.trim();
  const maxTeamsRaw = (formData.get("maxTeams") as string | null)?.trim();
  const teamMinSizeRaw = (formData.get("teamMinSize") as string | null)?.trim();
  const teamMaxSizeRaw = (formData.get("teamMaxSize") as string | null)?.trim();
  const isActiveRaw = formData.get("isActive") as string | null;
  const isAllDayRaw = formData.get("isAllDay") as string | null;
  const date = dateRaw ? new Date(dateRaw) : null;
  const maxParticipants = maxParticipantsRaw ? Number(maxParticipantsRaw) : null;
  const maxTeams = maxTeamsRaw ? Number(maxTeamsRaw) : null;
  const teamMinSize = teamMinSizeRaw ? Number(teamMinSizeRaw) : null;
  const teamMaxSize = teamMaxSizeRaw ? Number(teamMaxSizeRaw) : null;
  const isActive = isActiveRaw === "on";
  const isAllDay = isAllDayRaw === "on";
  const category = categoryRaw ? (categoryRaw.toUpperCase() as "EVENT" | "WORKSHOP") : "EVENT";
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const year = Number(yearRaw);

  if (!name) {
    return;
  }

  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    return;
  }

  if ((date && Number.isNaN(date.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
    return;
  }

  if (date && endDate && endDate < date) {
    return;
  }

  if (!coordinatorDetails) {
    return;
  }

  if (maxParticipants != null && (!Number.isFinite(maxParticipants) || maxParticipants < 1)) {
    return;
  }

  if (maxTeams != null && (!Number.isFinite(maxTeams) || maxTeams < 1)) {
    return;
  }

  if (participationMode === "TEAM") {
    if (teamMinSize != null && (!Number.isFinite(teamMinSize) || teamMinSize < 1)) {
      return;
    }
    if (teamMaxSize != null && (!Number.isFinite(teamMaxSize) || teamMaxSize < 1)) {
      return;
    }
    if (teamMinSize != null && teamMaxSize != null && teamMinSize > teamMaxSize) {
      return;
    }
  }

  const existingEvent = await prisma.event.findFirst({
    where: {
      name,
      year,
    },
    select: { id: true },
  });

  const eventData = {
    year,
    type,
    dayLabel,
    date,
    endDate,
    description,
    rulesUrl,
    coordinatorName: coordinatorDetails.coordinatorName,
    coordinatorPhone: coordinatorDetails.coordinatorPhone,
    category,
    trainerName,
    contactName: null,
    contactPhone: null,
    participationMode,
    isAllDay,
    teamMinSize: participationMode === "TEAM" ? teamMinSize : null,
    teamMaxSize: participationMode === "TEAM" ? teamMaxSize : null,
    maxTeams,
    maxParticipants,
    isActive,
    isArchived: false,
    isTemplate: false,
    templateSourceId: null,
  };

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

  revalidateEventPaths();

  await logAdminAudit({
    action: "EVENT_CREATE_OR_UPDATE",
    actorId: user.id,
    actorEmail: user.email,
    target: name,
    status: "SUCCESS",
    details: {
      participationMode,
      maxParticipants,
      maxTeams,
      isActive,
    },
  });

  redirect(`/admin/events?year=${encodeURIComponent(String(year))}&formReset=${Date.now()}`);
}
