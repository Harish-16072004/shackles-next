import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Avoid connecting during build if possible
const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

/**
 * Shared Redis connection for BullMQ and general caching.
 */
let redis: Redis | null = null;

export function getRedis() {
  if (redis) return redis;

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    // Disable lazyConnect so it doesn't try to connect immediately
    lazyConnect: true,
    retryStrategy: (times) => {
      // Don't retry indefinitely during build
      if (isBuild && times > 1) return null;
      return Math.min(times * 50, 2000);
    },
  });

  redis.on("error", (err) => {
    // Suppress noise during build
    if (!isBuild) {
      console.error("Redis Connection Error:", err);
    }
  });

  return redis;
}

// Export for backward compatibility (lazy-initialized on first access)
export const redisConnection = getRedis();
