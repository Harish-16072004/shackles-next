export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (interval) {
      clearInterval(interval);
      interval = undefined;
    }
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };

  const safeEnqueue = () => {
    if (closed || !controllerRef) return;
    try {
      controllerRef.enqueue(encoder.encode(`data: ${Date.now()}\n\n`));
    } catch {
      closed = true;
      cleanup();
    }
  };

  const safeClose = () => {
    if (closed || !controllerRef) return;
    closed = true;
    cleanup();
    try {
      controllerRef.close();
    } catch {}
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;

      safeEnqueue();

      interval = setInterval(() => {
        safeEnqueue();
      }, 10000);

      timeout = setTimeout(() => {
        safeClose();
      }, 1000 * 60 * 5);
    },
    cancel() {
      cleanup();
      safeClose();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
