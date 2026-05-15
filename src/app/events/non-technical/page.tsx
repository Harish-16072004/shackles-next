import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveYear } from "@/lib/edition";
import EventCategoryPage from "@/components/features/EventCategoryPage";

export default async function NonTechnicalEventsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const activeYear = getActiveYear();
  const resolvedParams = (await searchParams) ?? {};

  const events = await prisma.event.findMany({
    where: {
      year: activeYear,
      type: "NON-TECHNICAL",
      category: "EVENT",
      isActive: true,
      isTemplate: false,
      isArchived: false,
    },
    orderBy: [{ date: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      rulesUrl: true,
      date: true,
      endDate: true,
      participationMode: true,
      teamMinSize: true,
      teamMaxSize: true,
      trainerName: true,
      coordinatorName: true,
      coordinatorPhone: true,
      contactName: true,
      contactPhone: true,
    },
  });

  const serializedEvents = events.map((e) => ({
    ...e,
    date: e.date?.toISOString() ?? null,
    endDate: e.endDate?.toISOString() ?? null,
  }));

  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading Non-Technical Events...</div>}>
      <EventCategoryPage
        category="NON-TECHNICAL"
        events={serializedEvents}
        inviteToken={typeof resolvedParams.inviteToken === "string" ? resolvedParams.inviteToken : undefined}
        teamCode={typeof resolvedParams.teamCode === "string" ? resolvedParams.teamCode : undefined}
      />
    </Suspense>
  );
}
