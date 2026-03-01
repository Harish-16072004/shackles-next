"use client";

import { useState, memo, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";

const specialEvents = [
  {
    id: "vision-trial",
    title: "VISION TRIAL",
    description:
      "An innovative challenge that tests visual perception, observation skills, and analytical thinking. Participants navigate through visual puzzles and optical challenges that require sharp eyes and creative interpretation. Perfect for those with keen observation abilities.",
    rules: "https://example.com/vision-trial-rules",
    coordinator: {
      name: "RAVI",
      phone: "+91 65432110",
    },
  },
  {
    id: "robo-rumble",
    title: "ROBO RUMBLE",
    description:
      "A dynamic robotics competition where teams build and program robots to compete in real-time challenges. Combining mechanics, electronics, and programming, this event showcases innovation in autonomous systems. Strategy and execution decide the victor.",
    rules: "https://example.com/robo-rumble-rules",
    coordinator: {
      name: "VIKRAM",
      phone: "+91 54321099",
    },
  },
];

const EventCard = memo(({ event, onClick }: { event: typeof specialEvents[0]; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex h-full flex-col gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-600/30"
  >
    <div className="h-4 w-4 rounded-full border border-current" />
    <h2 className="text-xl font-semibold text-gray-900 leading-tight">
      {event.title}
    </h2>
    <p className="text-sm text-gray-600 leading-relaxed">
      {event.description.substring(0, 120)}...
    </p>
  </button>
));

EventCard.displayName = 'EventCard';

export default function SpecialEvents() {
  const [selectedEvent, setSelectedEvent] = useState<(typeof specialEvents)[0] | null>(null);
  const [statsByName, setStatsByName] = useState<Record<string, { registeredCount: number; spotsLeft: number | null; isActive: boolean }>>({});
  const [registering, setRegistering] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    async function loadStats() {
      try {
        const response = await fetch("/api/events/public-stats?category=SPECIAL", { cache: "no-store" });
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
        <h1 className="text-4xl font-semibold text-gray-900">Special Events</h1>
        <p className="text-lg text-gray-600">2 Unique Experiences Beyond Categories</p>
        <Link
          href="/events"
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <span>←</span>
          <span>Back to events</span>
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {specialEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onClick={() => setSelectedEvent(event)}
          />
        ))}
      </section>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="relative w-full max-w-2xl rounded-2xl border-2 border-emerald-900/50 bg-gray-900 p-8 text-white max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute right-4 top-4 rounded border border-emerald-600 p-1 text-emerald-600 hover:bg-emerald-600 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="mb-6 flex items-center gap-3">
              <div className="h-6 w-6 rounded-full border border-current" />
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
                    className="text-emerald-500 hover:text-emerald-400 font-mono text-sm"
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
