import { CountdownOptimized } from "@/components/features/CountdownOptimized";

const challengeCards = [
  {
    title: "The Challenge",
    description:
      "Shackles 25–26 is a survival-style symposium. Navigate technical gauntlets, strategic puzzles, and innovation briefs built to test clarity under pressure.",
    icon: "◇",
  },
  {
    title: "The Rules",
    description:
      "Two focused days. Pick your track—technical, non-technical, or special events. Every round trims the field; only consistent, calm execution advances.",
    icon: "△",
  },
  {
    title: "The Prize",
    description:
      "Credible wins, cash awards, and a spotlight on your craft. Strategy, teamwork, and delivery are the only levers that matter here.",
    icon: "○",
  },
];

const aboutCards = [
  {
    title: "Alagappa Chettiar Government College of Engineering and Technology",
    description:
      "An autonomous institution with decades of engineering education, research, and student-led initiatives anchored in Karaikudi, Tamil Nadu.",
  },
  {
    title: "Department of Mechanical Engineering",
    description:
      "NBA-accredited, with deep project culture across manufacturing, design, and analysis. The team behind the event’s discipline and logistics.",
  },
  {
    title: "Shackles 25–26",
    description:
      "A national-level symposium framed as a survival game. Built to reward sharp execution, clean thinking, and collaborative problem-solving.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-16 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white px-8 py-12 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-gray-900/0 via-gray-900/15 to-gray-900/0" />

        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-800">
              Shackles 25–26
            </span>
            <span className="text-gray-500">
              Alagappa Chettiar Government College of Engineering and Technology
            </span>
          </div>

          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.25em] text-gray-500">National level symposium</p>
            <h1 className="text-5xl font-semibold tracking-tight text-gray-900 md:text-6xl">
              Break free from the ordinary.
            </h1>
            <p className="text-lg text-gray-600 md:max-w-2xl">
              Two minimal, high-energy days on campus—built to highlight sharp ideas, deliberate design, and fast execution.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <div className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              <span>October 23–24, 2025 · Karaikudi</span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-gray-900" aria-hidden />
              <span>On-campus, student-curated schedule</span>
            </div>
          </div>

          <CountdownOptimized />
        </div>
      </section>

      <section id="experience" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">Welcome, player</p>
          <h2 className="text-2xl font-semibold text-gray-900">What to expect</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {challengeCards.map((item) => (
            <div
              key={item.title}
              className="flex h-full flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300"
            >
              <div className="flex items-center gap-3 text-gray-700">
                <span className="grid h-10 w-10 place-items-center rounded-full border border-gray-200 text-base font-semibold text-gray-900">
                  {item.icon}
                </span>
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500">About us</p>
          <h2 className="text-2xl font-semibold text-gray-900">Who is hosting</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {aboutCards.map((item) => (
            <div
              key={item.title}
              className="flex h-full flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-gray-300"
            >
              <h3 className="text-lg font-semibold text-gray-900 leading-snug">{item.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}