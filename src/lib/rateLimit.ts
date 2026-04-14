import { LRUCache } from "lru-cache";
import { NextResponse } from "next/server";
import { logger } from "./logger";

/**
 * In-memory rate limiter — sliding window.
 *
 * Strategy: LRU cache keyed by `${scope}:${identifier}`.
 * Each entry is an array of timestamps (ms) of recent requests. On check,
 * we drop timestamps older than `windowMs` and compare remaining count with `max`.
 *
 * Limitations:
 * - Per-lambda (Vercel serverless). A burst across multiple cold starts may
 *   exceed limits in aggregate. Acceptable for single-tenant use.
 * - Swap to Upstash Redis (src/lib/rateLimit.ts) without touching routes when
 *   multi-tenant or multi-region.
 *
 * Usage in a route:
 *   const rl = rateLimit(userId, "gemini");
 *   if (!rl.success) return rateLimitResponse(rl, requestId);
 */

const log = logger.child({ component: "rate-limit" });

interface Bucket {
  max: number;
  windowMs: number;
}

const BUCKETS: Record<string, Bucket> = {
  // Expensive Gemini-backed endpoints: 10/min per user
  gemini: { max: 10, windowMs: 60_000 },
  // All other /api/agent/* endpoints: 30/min per user
  agent: { max: 30, windowMs: 60_000 },
  // Sync (Gmail API calls): 5/min to avoid Gmail quota bursts
  sync: { max: 5, windowMs: 60_000 },
};

// Cache holds up to 5000 entries (userId × scope) with 10-min TTL
const cache = new LRUCache<string, number[]>({
  max: 5000,
  ttl: 10 * 60 * 1000,
});

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetInMs: number;
}

/**
 * Check if a request is allowed. Records the call on success.
 *
 * @param identifier — user id preferred, fallback to IP
 * @param scope — bucket key (see BUCKETS above)
 */
export function rateLimit(identifier: string, scope: keyof typeof BUCKETS): RateLimitResult {
  const bucket = BUCKETS[scope];
  const key = `${scope}:${identifier}`;
  const now = Date.now();
  const windowStart = now - bucket.windowMs;

  const timestamps = (cache.get(key) || []).filter((t) => t > windowStart);

  if (timestamps.length >= bucket.max) {
    const oldest = timestamps[0];
    const resetInMs = Math.max(0, oldest + bucket.windowMs - now);
    log.warn({ identifier, scope, count: timestamps.length, max: bucket.max }, "rate limit exceeded");
    return { success: false, limit: bucket.max, remaining: 0, resetInMs };
  }

  timestamps.push(now);
  cache.set(key, timestamps);

  return {
    success: true,
    limit: bucket.max,
    remaining: bucket.max - timestamps.length,
    resetInMs: bucket.windowMs,
  };
}

/**
 * Return a 429 response with standard headers. Call when rateLimit() returns
 * success: false.
 */
export function rateLimitResponse(
  result: RateLimitResult,
  requestId: string,
  message = "Demasiadas peticiones. Espera unos segundos."
): NextResponse {
  return NextResponse.json(
    { error: message, requestId, retryAfterMs: result.resetInMs },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "Retry-After": String(Math.ceil(result.resetInMs / 1000)),
      },
    }
  );
}
