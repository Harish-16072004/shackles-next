/**
 * Rate limiting implementation with in-memory fallback and Redis support
 * For production, ensure UPSTASH_REDIS_REST_URL is set for distributed rate limiting
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Simple in-memory implementation for local development
class InMemoryRateLimiter {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  async limit(key: string): Promise<{ success: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetTime) {
      // New window or expired entry
      const resetTime = now + this.windowMs;
      this.store.set(key, { count: 1, resetTime });
      return {
        success: true,
        remaining: this.maxRequests - 1,
        resetTime,
      };
    }

    // Existing window
    const remaining = this.maxRequests - entry.count - 1;
    if (entry.count >= this.maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetTime: entry.resetTime,
      };
    }

    entry.count++;
    return {
      success: true,
      remaining,
      resetTime: entry.resetTime,
    };
  }
}

/**
 * Factory function to create a rate limiter
 * Uses Upstash Redis in production if configured, otherwise in-memory
 */
export function createRateLimiter(
  config: {
    windowMs: number; // Time window in milliseconds
    maxRequests: number; // Max requests per window
    keyPrefix?: string; // Key prefix for Redis
    redisCacheKey?: string; // Redis cache key (optional, for distributed rate limiting)
  }
) {
  const { windowMs, maxRequests, keyPrefix = "ratelimit", redisCacheKey } = config;

  // Try to use Redis if configured
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });

      return new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs}ms`),
        prefix: keyPrefix,
        analytics: true,
      });
    } catch (error) {
      console.warn("[Rate Limit] Failed to initialize Redis, falling back to in-memory:", error);
    }
  }

  // Fallback to in-memory implementation
  const inMemory = new InMemoryRateLimiter(windowMs, maxRequests);

  return {
    limit: async (key: string) => {
      const result = await inMemory.limit(key);
      return {
        success: result.success,
        remaining: result.remaining,
        reset: result.resetTime,
      };
    },
  };
}

/**
 * Extract client identifier for rate limiting
 * Tries multiple methods to identify client
 */
export function getClientIdentifier(request: Request): string {
  // Try header-based identification
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback (unlikely in production)
  return "unknown";
}

/**
 * Preset rate limit configurations for different use cases
 */
export const rateLimitPresets = {
  // Auth endpoints: strict limits
  auth: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 attempts per hour
  },

  // Chat/AI endpoints: moderate limits
  chat: {
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    maxRequests: 50, // 50 messages per day
  },

  // File uploads: moderate limits
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 5, // 5 uploads per hour
  },

  // Public registration: strict limits
  registration: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 registrations per hour
  },

  // Offline sync: moderate limits per device
  offlineSync: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 20, // 20 sync operations per hour
  },

  // Admin CSV imports: very strict limits
  adminImport: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 2, // 2 imports per hour
  },
};
