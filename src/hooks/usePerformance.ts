"use client";

import React, { useCallback, useEffect } from "react";

/**
 * Schedule non-critical work using requestIdleCallback
 * Executes callback when browser has idle time
 */
export function useIdleCallback(callback: () => void) {
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const idleId = requestIdleCallback(callback, { timeout: 2000 });
      return () => cancelIdleCallback(idleId);
    } else {
      // Fallback to setTimeout for browsers without requestIdleCallback
      const timerId = setTimeout(callback, 0);
      return () => clearTimeout(timerId);
    }
  }, [callback]);
}

/**
 * Batch multiple state updates to reduce re-renders
 */
export function useBatchedState<T>(initialState: T) {
  const [state, setState] = React.useState(initialState);
  const pendingUpdatesRef = React.useRef<Partial<T>>({});

  const batchUpdate = useCallback((updates: Partial<T>) => {
    pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates };
    
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        setState(prev => ({ ...prev, ...pendingUpdatesRef.current }));
        pendingUpdatesRef.current = {};
      });
    } else {
      setState(prev => ({ ...prev, ...pendingUpdatesRef.current }));
      pendingUpdatesRef.current = {};
    }
  }, []);

  return [state, batchUpdate] as const;
}
