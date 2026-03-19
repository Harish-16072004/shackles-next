import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function IDCardsPage() {
  const session = await getSession();
  if (!session?.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId as string },
  });
  if (!user || user.role !== "ADMIN") redirect("/login");

  // Count eligible participants per registration type
  const baseWhere = { shacklesId: { not: null }, payment: { status: "VERIFIED" as const } };
  const [total, general, workshop, combo] = await Promise.all([
    prisma.user.count({ where: baseWhere }),
    prisma.user.count({ where: { ...baseWhere, registrationType: "GENERAL" } }),
    prisma.user.count({ where: { ...baseWhere, registrationType: "WORKSHOP" } }),
    prisma.user.count({ where: { ...baseWhere, registrationType: "COMBO" } }),
  ]);

  const cards = [
    {
      label: "All Participants",
      count: total,
      type: "ALL",
      accent: "border-gray-400/30 hover:border-gray-300/50",
      btn: "bg-gray-700 hover:bg-gray-600",
    },
    {
      label: "General",
      count: general,
      type: "GENERAL",
      accent: "border-blue-400/30 hover:border-blue-300/50",
      btn: "bg-blue-700 hover:bg-blue-600",
    },
    {
      label: "Workshop",
      count: workshop,
      type: "WORKSHOP",
      accent: "border-purple-400/30 hover:border-purple-300/50",
      btn: "bg-purple-700 hover:bg-purple-600",
    },
    {
      label: "Combo",
      count: combo,
      type: "COMBO",
      accent: "border-green-400/30 hover:border-green-300/50",
      btn: "bg-green-700 hover:bg-green-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 p-8 text-white">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-2 flex items-center gap-3">
          <a
            href="/admin/adminDashboard"
            className="text-sm text-gray-400 transition-colors hover:text-white"
          >
            ← Dashboard
          </a>
          <span className="text-gray-600">/</span>
          <h1 className="text-2xl font-bold">ID Card Generator</h1>
        </div>
        <p className="mb-8 text-sm text-gray-400">
          Generates a print-ready A3 PDF at 300 PPI · 16 cards per page (4 × 4) ·
          Only participants with a verified payment and a Shackles ID are included.
        </p>

        {/* Download tiles */}
        <div className="grid grid-cols-2 gap-4">
          {cards.map(({ label, count, type, accent, btn }) => (
            <div
              key={type}
              className={`rounded-xl border bg-white/5 p-6 transition-colors ${accent}`}
            >
              <div className="mb-1 text-4xl font-bold tabular-nums">{count}</div>
              <div className="mb-5 text-sm text-gray-400">{label}</div>
              {count > 0 ? (
                <a
                  href={`/api/admin/id-cards/export?type=${type}`}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${btn}`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download PDF
                </a>
              ) : (
                <span className="inline-block rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-gray-500 cursor-not-allowed">
                  No participants
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Template notice */}
        <div className="mt-8 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-sm text-yellow-300">
          <p className="mb-1 font-semibold">Template requirement</p>
          <p className="text-yellow-200/70">
            Place your ID card background PNG (exactly{" "}
            <span className="font-mono font-semibold">744 × 1004 px</span> at 300 PPI)
            at:
          </p>
          <code className="mt-1 block rounded bg-yellow-500/10 px-2 py-1 font-mono text-xs">
            public/templates/id-card-template.png
          </code>
        </div>

        {/* Card layout info */}
        <div className="mt-4 rounded-xl border border-white/5 bg-white/3 p-4 text-xs text-gray-500">
          <span className="font-semibold text-gray-400">Layout: </span>
          A3 page (29.7 × 42 cm) · 4 columns × 4 rows · card size 6.3 × 8.5 cm ·
          gutter ≈ 9 mm H / 16 mm V · 16 cards per page
        </div>
      </div>
    </div>
  );
}
