"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  intervalMs?: number;
};

export default function LiveSyncRefresher({ intervalMs = 15000 }: Props) {
  const router = useRouter();

  useEffect(() => {
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    let source: EventSource | null = null;

    const refresh = () => {
      router.refresh();
    };

    try {
      source = new EventSource("/api/live-sync");
      source.onmessage = () => {
        refresh();
      };
      source.onerror = () => {
        if (!fallbackInterval) {
          fallbackInterval = setInterval(refresh, intervalMs);
        }
      };
    } catch {
      fallbackInterval = setInterval(refresh, intervalMs);
    }

    return () => {
      if (source) {
        source.close();
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [intervalMs, router]);

  return null;
}