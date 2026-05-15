import { Redis } from "ioredis";

// BullMQ requires a dedicated ioredis connection — it cannot share
// the connection used by other parts of your app.
// Set REDIS_URL in your .env: redis://localhost:6379

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is not set");
}

// maxRetriesPerRequest: null is REQUIRED by BullMQ
export const redisConnection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on("error", (err) => {
  console.error("[Redis] Connection error:", err.message);
});

redisConnection.on("connect", () => {
  console.log("[Redis] Connected");
});
