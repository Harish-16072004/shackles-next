"use client";

import { useState, memo, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const technicalEvents = [
  {
    id: "innovation-duel",
    title: "INNOVATION DUEL",
    description:
      "Paper presentation is a platform for aspiring mechanical engineers to showcase their innovative ideas, research insights, and technical prowess. This event aims to encourage analytical thinking, effective communication, and academic research among students. Present your ideas, defend your concepts, and engage in technical discourse with peers and experts in the field.",
    rules: "https://example.com/innovation-duel-rules",
    coordinator: {
      name: "MAGITH",
      phone: "+91 67276470",
    },
  },
  {
    id: "brain-busters-arena",
    title: "BRAIN BUSTERS ARENA",
    description:
      "Brain busters arena is an existing knowledge-based competition designed to test the core understanding, problem-solving ability, and quick thinking of participants in the field of Mechanical Engineering. The event aims to encourage students to showcase their technical skills and knowledge.",
    rules: "https://example.com/brain-busters-rules",
    coordinator: {
      name: "JOHN DOE",
      phone: "+91 98765432",
    },
  },
  {
    id: "dimensions-forge",
    title: "DIMENSIONS FORGE",
    description:
      "In CAD Modeling, the participants create detailed digital representations of objects or system using specialized software. This event involves designing in 3D to visualize and plan how something will look. The event will help to enhance your skills in 3D Modeling. Problem solving and time management.",
    rules: "https://example.com/dimensions-forge-rules",
    coordinator: {
      name: "SARAH",
      phone: "+91 87654321",
    },
  },
  {
    id: "sky-shot",
    title: "SKY SHOT",
    description:
      "A precision engineering challenge focused on projectile dynamics and ballistics. Participants design and calibrate systems to hit targets with accuracy. This event tests your understanding of physics, engineering principles, and practical problem-solving.",
    rules: "https://example.com/sky-shot-rules",
    coordinator: {
      name: "ALEX",
      phone: "+91 76543210",
    },
  },
  {
    id: "engine-gamble",
    title: "ENGINE GAMBLE",
    description:
      "An immersive challenge on engine mechanics and thermodynamic principles. Participants solve complex engine-related problems and optimize performance parameters. Strategic thinking and technical knowledge are key.",
    rules: "https://example.com/engine-gamble-rules",
    coordinator: {
      name: "MIKE",
      phone: "+91 65432109",
    },
  },
  {
    id: "mech-showdown",
    title: "MECH SHOWDOWN",
    description:
      "A comprehensive mechanical engineering competition combining design, analysis, and execution. Teams face real-world challenges and compete on innovation, efficiency, and presentation. The ultimate test of mechanical aptitude.",
    rules: "https://example.com/mech-showdown-rules",
    coordinator: {
      name: "PRIYA",
      phone: "+91 54321098",
    },
  },
];

const EventCard = memo(({ event, onClick }: { event: typeof technicalEvents[0]; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex h-full flex-col gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-red-600/30"
  >
    <div className="h-4 w-4 rounded bg-white/50" />
    <h2 className="text-xl font-semibold text-gray-900 leading-tight">
      {event.title}
    </h2>
    <p className="text-sm text-gray-600 leading-relaxed">
      {event.description.substring(0, 120)}...
    </p>
  </button>
));

EventCard.displayName = 'EventCard';

export default function TechnicalEvents() {
  const [selectedEvent, setSelectedEvent] = useState<(typeof technicalEvents)[0] | null>(null);
  const [statsByName, setStatsByName] = useState<Record<string, { registeredCount: number; spotsLeft: number | null; isActive: boolean }>>({});
  const [registering, setRegistering] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function loadStats() {
      try {
        const response = await fetch("/api/events/public-stats?category=TECHNICAL", { cache: "no-store" });
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
        // ignore
      }
    }

    loadStats();
  }, []);

  async function handleRegister(eventTitle: string) {
    try {
      setRegistering(true);
      setFeedback("");
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
      }
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex flex-col gap-12 pb-8">
      <section className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold text-gray-900">Technical Events</h1>
        <p className="text-lg text-gray-600">6 Challenging Events for Engineering Minds</p>
        <Link
          href="/events"
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <span>←</span>
          <span>Back to events</span>
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {technicalEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onClick={() => setSelectedEvent(event)}
          />
        ))}
      </section>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="relative w-full max-w-2xl rounded-2xl border-2 border-red-900/50 bg-gray-900 p-8 text-white max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute right-4 top-4 rounded border border-red-600 p-1 text-red-600 hover:bg-red-600 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="mb-6 flex items-center gap-3">
              <div className="h-6 w-6 rounded bg-white/20" />
              <h2 className="text-2xl font-bold text-gray-100">
                {selectedEvent.title}
              </h2>
            </div>

            <p className="mb-6 text-sm leading-relaxed text-gray-300">
              {selectedEvent.description}
            </p>

            {(() => {
              const stat = statsByName[selectedEvent.title.trim().toUpperCase()];
              if (!stat) return null;
              return (
                <p className="mb-4 text-xs text-gray-300">
                  Registered: {stat.registeredCount}
                  {stat.spotsLeft != null ? ` • Spots left: ${stat.spotsLeft}` : ""}
                </p>
              );
            })()}

            <div className="mb-6 flex flex-col gap-4 border-t border-gray-700 pt-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">
                  Rules & Regulations
                </h3>
                <a
                  href={selectedEvent.rules}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded border border-emerald-600 px-4 py-2 font-medium text-emerald-500 hover:bg-emerald-600/10"
                >
                  <span>📄</span>
                  <span>VIEW RULES & REGULATIONS</span>
                </a>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">
                  Event Coordinator
                </h3>
                <div className="rounded border border-gray-700 bg-gray-800/50 p-4">
                  <p className="text-sm font-semibold text-gray-400 uppercase mb-2">
                    {selectedEvent.coordinator.name}
                  </p>
                  <a
                    href={`tel:${selectedEvent.coordinator.phone}`}
                    className="text-red-500 hover:text-red-400 font-mono text-sm"
                  >
                    {selectedEvent.coordinator.phone}
                  </a>
                </div>
              </div>
            </div>

            <button
              disabled={registering}
              onClick={() => handleRegister(selectedEvent.title)}
              className="w-full rounded-lg bg-gray-100 py-3 font-semibold text-gray-900 hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {registering ? "REGISTERING..." : "REGISTER FOR THIS EVENT"}
            </button>
            {feedback && <p className="mt-3 text-xs text-gray-300">{feedback}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
