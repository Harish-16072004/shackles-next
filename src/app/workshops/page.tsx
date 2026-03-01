"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";

const workshops = [
  {
    id: "additive-manufacturing",
    title: "Additive Manufacturing Workshop",
    date: "October 23, 2025",
    time: "2:00 PM - 5:00 PM",
    description:
      "An additive manufacturing workshop introduces the process of building three-dimensional objects layer-by-layer directly from a digital model. It typically covers various AM technologies, materials, design principles like design for Additive Manufacturing (DfAM), and post-processing techniques. Participants learn how to use design complexity, prototyping, and the production of customized or lightweight functional parts across multiple industries.",
    trainer: "D.S.M Shagorn",
    teamName: "Workshop Team",
    teamPhone: "+91 9043534432",
  },
  {
    id: "smart-manufacturing",
    title: "Smart Manufacturing Workshop",
    date: "October 23, 2025",
    time: "10:00 AM - 1:00 PM",
    description:
      "A Smart manufacturing workshop explores the integration of advanced technologies, like AI, IoT, and data analytics into production systems. Participants will learn how to leverage these tools to optimize operations, enhance efficiency, improve quality control, and enable real-time decision-making. Ultimately driving the shift towards a more connected and adaptive industrial landscape.",
    trainer: "Certified Professional",
    teamName: "Workshop Team",
    teamPhone: "+91 9876543209",
  },
];

const benefits = [
  {
    icon: "🎓",
    title: "Expert Guidance",
    description: "Learn from industry professionals with years of experience",
  },
  {
    icon: "🔧",
    title: "Hands-On Experience",
    description: "Practical sessions with real equipment and tools",
  },
  {
    icon: "📋",
    title: "Certificates",
    description: "Receive certificates for both workshops",
  },
  {
    icon: "💼",
    title: "Career Boost",
    description: "Add valuable skills to your resume",
  },
];

export default function Workshops() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statsByName, setStatsByName] = useState<Record<string, { registeredCount: number; spotsLeft: number | null; isActive: boolean }>>({});
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>("");

  useEffect(() => {
    async function loadStats() {
      try {
        const response = await fetch("/api/events/public-stats?category=WORKSHOP", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        const next: Record<string, { registeredCount: number; spotsLeft: number | null; isActive: boolean }> = {};
        for (const item of body.events || []) {
          next[String(item.name || "").trim().toUpperCase()] = {
            registeredCount: Number(item.registeredCount || 0),
            spotsLeft: item.spotsLeft == null ? null : Number(item.spotsLeft),
            isActive: Boolean(item.isActive),
          };
        }
        setStatsByName(next);
      } catch {
        // ignore transient fetch failures
      }
    }

    loadStats();
  }, []);

  async function handleRegister(eventTitle: string, eventId: string) {
    try {
      setFeedback("");
      setRegisteringId(eventId);
      const response = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventName: eventTitle }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(body.error || "Unable to register now.");
      } else {
        setFeedback(body.message || "Registered successfully.");
        const statsResponse = await fetch("/api/events/public-stats?category=WORKSHOP", { cache: "no-store" });
        if (statsResponse.ok) {
          const statsBody = await statsResponse.json();
          const next: Record<string, { registeredCount: number; spotsLeft: number | null; isActive: boolean }> = {};
          for (const item of statsBody.events || []) {
            next[String(item.name || "").trim().toUpperCase()] = {
              registeredCount: Number(item.registeredCount || 0),
              spotsLeft: item.spotsLeft == null ? null : Number(item.spotsLeft),
              isActive: Boolean(item.isActive),
            };
          }
          setStatsByName(next);
        }
      }
    } finally {
      setRegisteringId(null);
    }
  }

  return (
    <div className="flex flex-col gap-16 pb-8">
      <section className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-5xl font-semibold tracking-tight text-gray-900">
          Workshops
        </h1>
        <p className="text-lg text-gray-600">
          Skill-Building Sessions by Industry Experts
        </p>
        <p className="text-sm text-gray-500">
          October 23, 2025 | ACGCET Karaikudi
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {workshops.map((workshop) => (
          (() => {
            const key = workshop.title.trim().toUpperCase();
            const stat = statsByName[key];
            const isClosed = stat ? !stat.isActive || (stat.spotsLeft != null && stat.spotsLeft <= 0) : false;
            return (
          <div
            key={workshop.id}
            className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold text-gray-900">
                {workshop.title}
              </h2>
              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <span>📅</span>
                  {workshop.date}
                </span>
                <span className="flex items-center gap-1">
                  <span>🕐</span>
                  {workshop.time}
                </span>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-gray-600">
              {expandedId === workshop.id
                ? workshop.description
                : workshop.description.substring(0, 150) + "..."}
            </p>

            {expandedId !== workshop.id && (
              <button
                onClick={() => setExpandedId(workshop.id)}
                className="text-sm font-medium text-gray-600 hover:text-gray-900 underline"
              >
                Read more
              </button>
            )}

            <div className="border-t border-gray-200 pt-4">
              <div className="mb-3 text-xs text-gray-600">
                {stat ? (
                  <>
                    <span className="font-semibold">Registered:</span> {stat.registeredCount}
                    {stat.spotsLeft != null && (
                      <span> • <span className="font-semibold">Spots left:</span> {stat.spotsLeft}</span>
                    )}
                  </>
                ) : (
                  <span>Live count unavailable</span>
                )}
              </div>
              <div className="mb-4 flex flex-col gap-2">
                <p className="text-xs uppercase tracking-widest text-gray-500">
                  Trainer
                </p>
                <p className="font-medium text-gray-900">{workshop.trainer}</p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-widest text-gray-500">
                  Workshop Team
                </p>
                <a
                  href={`tel:${workshop.teamPhone}`}
                  className="flex items-center gap-2 font-medium text-gray-900 hover:text-blue-600"
                >
                  <Phone size={16} />
                  {workshop.teamPhone}
                </a>
              </div>
            </div>

            <button
              disabled={isClosed || registeringId === workshop.id}
              onClick={() => handleRegister(workshop.title, workshop.id)}
              className="w-full rounded-lg bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isClosed ? "REGISTRATION CLOSED" : registeringId === workshop.id ? "REGISTERING..." : "REGISTER NOW"}
            </button>
          </div>
            );
          })()
        ))}
      </section>

      {feedback && (
        <p className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          {feedback}
        </p>
      )}

      <section className="flex flex-col gap-8">
        <h2 className="text-center text-3xl font-semibold text-gray-900">
          Why Attend Our Workshops?
        </h2>

        <div className="grid gap-4 md:grid-cols-4">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm"
            >
              <div className="text-4xl">{benefit.icon}</div>
              <h3 className="font-semibold text-gray-900">{benefit.title}</h3>
              <p className="text-sm text-gray-600">{benefit.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
