/**
 * worker.ts
 * Main entry point for the background worker process.
 * This should be run as a separate process from the Next.js app.
 */

// Load environment variables if not running through a loader that does it
// import "dotenv/config"; 

import { qrWorker } from "./workers/qr.worker";
import { csvWorker } from "./workers/csv.worker";

console.log("🚀 BullMQ Workers Started Successfully");

// Handle graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n[${signal}] Shutting down workers...`);
  
  await Promise.all([
    qrWorker.close(),
    csvWorker.close(),
  ]);

  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
