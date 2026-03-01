"use client";

import { useEffect, useMemo, useState } from "react";

export function Countdown() {
  const targetDate = useMemo(() => new Date("2026-04-01T00:00:00+05:30"), []);
  const [countdown, setCountdown] = useState({
    days: "0",
    hours: "00",
    minutes: "00",
    seconds: "00",
  });

  useEffect(() => {
    const compute = () => {
      const now = new Date().getTime();
      const distance = Math.max(targetDate.getTime() - now, 0);

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((distance / (1000 * 60)) % 60);
      const seconds = Math.floor((distance / 1000) % 60);

      setCountdown({
        days: String(days),
        hours: hours.toString().padStart(2, "0"),
        minutes: minutes.toString().padStart(2, "0"),
        seconds: seconds.toString().padStart(2, "0"),
      });
    };

    compute();
    const timer = setInterval(compute, 5000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-800">
      <span className="text-xs uppercase tracking-[0.2em] text-gray-500">
        Countdown to April 1, 2026
      </span>
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Days", value: countdown.days },
          { label: "Hours", value: countdown.hours },
          { label: "Minutes", value: countdown.minutes },
          { label: "Seconds", value: countdown.seconds },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-[0_1px_0_0_rgba(17,24,39,0.05)]"
          >
            <span className="text-base font-semibold text-gray-900">
              {item.value}
            </span>
            <span className="text-xs text-gray-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
