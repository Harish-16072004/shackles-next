/**
 * Worker process entrypoint
 *
 * Run separately from Next.js:
 *   npx ts-node worker.ts
 *   OR in Docker: CMD ["node", "dist/worker.js"]
 *
 * This process stays alive and drains all three queues concurrently.
 * Next.js never imports workers — it only enqueues jobs via Server Actions.
 */

import "./workers/qr.worker";
import "./workers/csv.worker";
import "./workers/idCard.worker";

console.log("[Worker] All workers started. Waiting for jobs…");

// Graceful shutdown — let in-progress jobs finish before exiting
async function shutdown(signal: string) {
  console.log(`[Worker] Received ${signal}. Shutting down gracefully…`);

  const { qrWorker }     = await import("./workers/qr.worker");
  const { csvWorker }    = await import("./workers/csv.worker");
  const { idCardWorker } = await import("./workers/idCard.worker");

  await Promise.all([
    qrWorker.close(),
    csvWorker.close(),
    idCardWorker.close(),
  ]);

  console.log("[Worker] All workers closed. Exiting.");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
