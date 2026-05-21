import { Redis } from '@upstash/redis';

/**
 * Upstash Redis REST client — used for message buffering + debounce locking.
 *
 * Required env vars (add to .env.local and Vercel project settings):
 *   UPSTASH_REDIS_REST_URL   — e.g. https://xxx.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN — the REST token from Upstash console
 *
 * Get them at: https://console.upstash.com
 * Create a free Redis database → copy "REST URL" and "REST Token".
 */
export const redis = Redis.fromEnv();
