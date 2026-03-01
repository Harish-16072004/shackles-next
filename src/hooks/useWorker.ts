"use client";

import { useEffect, useRef } from "react";

export function useWorker<T, R>(
  workerType: 'COMPUTE_COUNTDOWN' | 'PROCESS_EVENT_DATA',
  payload: T,
  onResult: (result: R) => void
) {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Create Web Worker
    if (!workerRef.current && typeof window !== 'undefined') {
      try {
        workerRef.current = new Worker(
          new URL('../../../public/workers/compute.worker.ts', import.meta.url),
          { type: 'module' }
        );

        workerRef.current.onmessage = (event: MessageEvent) => {
          onResult(event.data.payload);
        };

        workerRef.current.onerror = (error) => {
          console.error('Worker error:', error);
        };
      } catch {
        console.warn('Web Workers not available, using main thread');
      }
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, [onResult]);

  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: workerType,
        payload
      });
    }
  }, [workerType, payload]);
}
