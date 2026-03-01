export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${Date.now()}\n\n`));

      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(`data: ${Date.now()}\n\n`));
      }, 10000);

      const close = () => {
        clearInterval(interval);
        controller.close();
      };

      setTimeout(close, 1000 * 60 * 5);
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
