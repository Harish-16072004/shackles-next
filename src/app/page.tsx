import { CountdownOptimized } from "@/components/features/CountdownOptimized";

const aboutCards = [
  {
    title: "Alagappa Chettiar Government College of Engineering and Technology",
    description:
      "Alagappa Chettiar Government College of Engineering and Technology (ACGCET), with over 70 years of academic excellence, is one of the region's most esteemed government institutions — offering quality education at a nominal fee without compromising standards. Our autonomous status allows us to design industry-aligned curricula, supported by experienced faculty dedicated to holistic student development. A vibrant campus life — enriched by clubs, associations, intra and inter-college competitions, and sports facilities — complements rigorous academics, fostering leadership, teamwork, and creativity. Backed by a strong alumni network and a consistent record of high placements with leading companies, ACGCET stands where tradition meets innovation, empowering students to become competent, responsible, and future-ready professionals.",
  },
  {
    title: "Department of Mechanical Engineering",
    description:
      "The Department of Mechanical Engineering, established in 1952 and NBA accredited, has grown from 40 students to 120 over seven decades — offering B.E., Part-Time B.E., and M.E. programmes in Manufacturing Engineering and Computer Aided Design. Recognized as an Anna University research centre since 2002, the department has produced 50+ Ph.D. scholars across Composite Materials, Heat Transfer, Robotics & Automation, and Additive Manufacturing, further strengthened by a Government of Tamil Nadu-funded Centre of Excellence in Additive Manufacturing (2019). Beyond academics, students compete in BAJA, Go-Kart, Solar Car, and Effi-Cycle challenges through SAE, while gaining industry exposure through internships, guest lectures, and industrial visits.",
  },
  {
    title: "Shackles 25–26",
    description:
      "Shackles is a National Level Inter-Collegiate Symposium conducted by the Mechanical Engineering Association of Alagappa Chettiar Government College of Engineering and Technology (ACGCET), bringing together bright minds from institutions across the country. The event features a dynamic blend of technical and non-technical events designed to challenge, inspire, and celebrate engineering talent. Alongside competitive events, hands-on workshops on cutting-edge technologies provide participants with practical exposure beyond the classroom — making Shackles not just a competition, but a platform for learning, networking, and innovation.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-10 md:gap-16 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 py-8 md:px-8 md:py-12 shadow-xs">
        <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-gray-900/0 via-gray-900/15 to-gray-900/0" />

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
            <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900 md:text-6xl">
              Break free from the ordinary.
            </h1>
            <p className="text-base sm:text-lg text-gray-600 md:max-w-2xl">
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

      <section id="experience" className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-center text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900 md:text-6xl">Welcome, player</h1>
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
              className="flex h-full flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-xs transition-all hover:-translate-y-0.5 hover:border-gray-300"
            >
              <h3 className="text-lg font-semibold text-gray-900 leading-snug">{item.title}</h3>
              <p className="text-sm leading-relaxed text-gray-600 text-justify">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}