import Link from "next/link";
import { redirect } from "next/navigation";
import LiveSyncRefresher from "@/components/common/LiveSyncRefresher";
import { prisma } from "@/lib/prisma";

const eventCategories = [
  {
    id: "technical",
    title: "Technical Events",
    description: "Admin-managed technical challenges",
    icon: "■",
    color: "pink",
  },
  {
    id: "non-technical",
    title: "Non-Technical Events",
    description: "Admin-managed creative challenges",
    icon: "○",
    color: "cyan",
  },
  {
    id: "special",
    title: "Special Events",
    description: "Admin-managed unique experiences",
    icon: "△",
    color: "green",
  },
];

const TYPE_TO_CATEGORY: Record<string, string> = {
  TECHNICAL: "technical",
  "NON-TECHNICAL": "non-technical",
  SPECIAL: "special",
};

export default async function Events({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = (await searchParams) ?? {};
  const inviteToken = typeof resolvedParams.inviteToken === "string" ? resolvedParams.inviteToken : "";
  const teamCode = typeof resolvedParams.teamCode === "string" ? resolvedParams.teamCode : "";
  const joinCode = typeof resolvedParams.joinCode === "string" ? resolvedParams.joinCode : "";

  // If invite params are present, look up the event and redirect to the correct category page
  if (inviteToken || teamCode || joinCode) {
    let eventType: string | null = null;

    if (inviteToken) {
      const invite = await prisma.teamInvite.findUnique({
        where: { token: inviteToken },
        select: {
          team: {
            select: {
              event: { select: { type: true } },
            },
          },
        },
      });
      eventType = invite?.team?.event?.type ?? null;
    }

    if (!eventType && teamCode) {
      const team = await prisma.team.findFirst({
        where: { teamCode: teamCode.toUpperCase() },
        select: { event: { select: { type: true } } },
      });
      eventType = team?.event?.type ?? null;
    }

    if (!eventType && joinCode) {
      const team = await prisma.team.findFirst({
        where: { joinCode },
        select: { event: { select: { type: true } } },
      });
      eventType = team?.event?.type ?? null;
    }

    if (eventType) {
      const categorySlug = TYPE_TO_CATEGORY[eventType] ?? "technical";
      const params = new URLSearchParams();
      if (inviteToken) params.set("inviteToken", inviteToken);
      if (teamCode) params.set("teamCode", teamCode);
      if (joinCode) params.set("joinCode", joinCode);
      redirect(`/events/${categorySlug}?${params.toString()}`);
    }
  }

  const mergedCategories = eventCategories;

  const borderColorMap = {
    pink: "border-red-900/50 hover:border-red-700",
    cyan: "border-cyan-900/50 hover:border-cyan-700",
    green: "border-emerald-900/50 hover:border-emerald-700",
  };

  const textColorMap = {
    pink: "text-red-600",
    cyan: "text-cyan-600",
    green: "text-emerald-600",
  };

  return (
    <div className="flex flex-col gap-12 pb-8">
      <LiveSyncRefresher intervalMs={12000} />
      <section className="flex flex-col gap-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
          EVENTS
        </h1>
        <p className="text-lg text-gray-600">

        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {mergedCategories.map((category) => (
          <Link
            key={category.id}
            href={`/events/${category.id}`}
            className={`group flex h-full flex-col gap-4 rounded-2xl border-2 bg-white/50 p-6 shadow-xs transition-all hover:-translate-y-1 ${borderColorMap[category.color as keyof typeof borderColorMap]
              }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-8 w-8 place-items-center text-xl font-bold ${textColorMap[category.color as keyof typeof textColorMap]
                    }`}
                >
                  {category.icon}
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {category.title}
                  </h2>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-700">{category.description}</p>

            <div className={`mt-auto flex items-center gap-2 ${textColorMap[category.color as keyof typeof textColorMap]} font-semibold uppercase text-sm`}>
              <span>EXPLORE</span>
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
