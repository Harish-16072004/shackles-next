"use client";

import { useState, memo, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const nonTechnicalEvents = [
  {
    id: "survival-bid",
    title: "SURVIVAL BID",
    description:
      "A strategic game where participants bid, negotiate, and strategize to survive elimination rounds. This event tests your decision-making, quick thinking, and ability to handle pressure in competitive scenarios. Only the sharpest survive.",
    rules: "https://example.com/survival-bid-rules",
    coordinator: {
      name: "AMIT",
      phone: "+91 67276471",
    },
  },
  {
    id: "film-quest",
    title: "FILM QUEST",
    description:
      "An engaging challenge focused on cinema, storytelling, and creative thinking. Participants identify films, guess quotes, and solve movie-related puzzles. A fun, fast-paced event celebrating cinematic art.",
    rules: "https://example.com/film-quest-rules",
    coordinator: {
      name: "SOPHIA",
      phone: "+91 98765433",
    },
  },
  {
    id: "red-light-green-light",
    title: "RED LIGHT GREEN LIGHT",
    description:
      "A thrilling physical and mental challenge combining reflexes, strategy, and composure. Stop at the wrong time and you're eliminated. Perfect for those who thrive under pressure and test their instincts.",
    rules: "https://example.com/red-light-rules",
    coordinator: {
      name: "ROHAN",
      phone: "+91 87654322",
    },
  },
  {
    id: "dalgona-candy",
    title: "DALGONA CANDY",
    description:
      "A delicate precision challenge inspired by the famous game. Participants must carve intricate patterns in brittle candy without breaking it. Patience, skill, and steady hands determine success.",
    rules: "https://example.com/dalgona-rules",
    coordinator: {
      name: "ANANYA",
      phone: "+91 76543211",
    },
  },
];

const EventCard = memo(({ event, onClick }: { event: typeof nonTechnicalEvents[0]; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex h-full flex-col gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-600/30"
  >
    <div className="h-4 w-4 rounded-full bg-white/50" />
    <h2 className="text-xl font-semibold text-gray-900 leading-tight">
      {event.title}
    </h2>
    <p className="text-sm text-gray-600 leading-relaxed">
      {event.description.substring(0, 120)}...
    </p>
  </button>
));

EventCard.displayName = 'EventCard';

export default function NonTechnicalEvents() {
  const [selectedEvent, setSelectedEvent] = useState<(typeof nonTechnicalEvents)[0] | null>(null);
  const [statsByName, setStatsByName] = useState<Record<string, { registeredCount: number; spotsLeft: number | null; isActive: boolean }>>({});
  const [registering, setRegistering] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function loadStats() {
      try {
        const response = await fetch("/api/events/public-stats?category=NON-TECHNICAL", { cache: "no-store" });
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
        <h1 className="text-4xl font-semibold text-gray-900">Non-Technical Events</h1>
        <p className="text-lg text-gray-600">4 Creative Challenges for All Minds</p>
        <Link
          href="/events"
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <span>←</span>
          <span>Back to events</span>
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {nonTechnicalEvents.map((event) => (
          <button
            key={event.id}
            onClick={() => setSelectedEvent(event)}
            className="flex h-full flex-col gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-600/30"
          >
            <div className="h-4 w-4 rounded-full bg-white/50" />
            <h2 className="text-xl font-semibold text-gray-900 leading-tight">
              {event.title}
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              {event.description.substring(0, 120)}...
            </p>
          </button>
        ))}
      </section>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="relative w-full max-w-2xl rounded-2xl border-2 border-cyan-900/50 bg-gray-900 p-8 text-white max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute right-4 top-4 rounded border border-cyan-600 p-1 text-cyan-600 hover:bg-cyan-600 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="mb-6 flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-white/20" />
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
                  className="inline-flex items-center gap-2 rounded border border-cyan-600 px-4 py-2 font-medium text-cyan-500 hover:bg-cyan-600/10"
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
                    className="text-cyan-500 hover:text-cyan-400 font-mono text-sm"
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
