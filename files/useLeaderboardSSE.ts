import { useEffect, useRef, useState } from "react";

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  name: string;
  shacklesId: string | null;
  isTeam: boolean;
  totalScore: number;
  breakdown: Record<string, number>;
  updatedAt: string;
}

interface UseLeaderboardSSEOptions {
  eventId: string;
  /** Called whenever a new snapshot arrives */
  onUpdate?: (entries: LeaderboardEntry[]) => void;
}

export function useLeaderboardSSE({ eventId, onUpdate }: UseLeaderboardSSEOptions) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  useEffect(() => {
    let active = true;

    function connect() {
      if (!active) return;

      const es = new EventSource(
        `/api/leaderboard/stream?eventId=${encodeURIComponent(eventId)}`
      );
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        setError(null);
        retryCount.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const data: LeaderboardEntry[] = JSON.parse(event.data);
          setEntries(data);
          onUpdate?.(data);
        } catch {
          console.error("[SSE] Failed to parse leaderboard payload");
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();

        // Exponential backoff: 1s, 2s, 4s, 8s … capped at 30s
        const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
        retryCount.current += 1;
        setError(`Connection lost. Reconnecting in ${delay / 1000}s…`);

        retryRef.current = setTimeout(() => {
          if (active) connect();
        }, delay);
      };
    }

    connect();

    return () => {
      active = false;
      if (retryRef.current) clearTimeout(retryRef.current);
      esRef.current?.close();
    };
  }, [eventId]); // reconnects automatically if eventId changes

  return { entries, connected, error };
}
