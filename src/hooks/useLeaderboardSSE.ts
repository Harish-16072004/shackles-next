'use client'

import { useEffect, useState, useRef } from "react";

export interface LeaderboardData {
  eventId: string;
  maxMarks: number;
  teams: {
    rank: number;
    teamId: string;
    teamName: string;
    totalMarks: number;
    componentMarks: {
      componentId: string;
      averageMarks: number;
    }[];
  }[];
}

export function useLeaderboardSSE(eventId: string) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    function connect() {
      if (eventSourceRef.current) eventSourceRef.current.close();

      const es = new EventSource(`/api/leaderboard/stream?eventId=${eventId}`);
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus("connected");
        setError(null);
        retryCountRef.current = 0;
      };

      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
        } catch (e) {
          console.error("Failed to parse SSE data", e);
        }
      };

      es.onerror = (e) => {
        setStatus("reconnecting");
        es.close();
        
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
        retryCountRef.current++;
        
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      eventSourceRef.current?.close();
    };
  }, [eventId]);

  return { data, error, status };
}
