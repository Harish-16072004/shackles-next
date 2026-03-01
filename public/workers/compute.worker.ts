// Web Worker for heavy computations
// Run intensive work off the main thread

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'COMPUTE_COUNTDOWN') {
    const { targetDate } = payload;
    const now = new Date().getTime();
    const targetTime = new Date(targetDate).getTime();
    const distance = Math.max(targetTime - now, 0);

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((distance / (1000 * 60)) % 60);
    const seconds = Math.floor((distance / 1000) % 60);

    self.postMessage({
      type: 'COUNTDOWN_RESULT',
      payload: {
        days: String(days),
        hours: hours.toString().padStart(2, '0'),
        minutes: minutes.toString().padStart(2, '0'),
        seconds: seconds.toString().padStart(2, '0'),
      }
    });
  }

  if (type === 'PROCESS_EVENT_DATA') {
    // Heavy data processing for event cards
    type EventPayload = { description?: string } & Record<string, unknown>;
    const { events } = payload;
    const processed = events.map((event: EventPayload) => ({
      ...event,
      descriptionPreview: (event.description || '').substring(0, 120) + '...',
      processed: true
    }));
    
    self.postMessage({
      type: 'EVENT_DATA_RESULT',
      payload: processed
    });
  }
};
