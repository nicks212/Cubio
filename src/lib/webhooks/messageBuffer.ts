import { redis } from '@/lib/redis';

/**
 * Redis-based message buffer for per-conversation debounce + single-processor locking.
 *
 * KEYS per conversation:
 *   cubio:buf:{convId}   — Redis List  — ordered pending message texts
 *   cubio:stamp:{convId} — Redis String — token of the last handler to write (last-writer wins)
 *   cubio:lock:{convId}  — Redis String — token of the handler currently processing
 *
 * FLOW (each webhook handler):
 *   1. bufferAndClaim()      — append message to list, overwrite stamp with own token
 *   2. sleep(DEBOUNCE_MS)    — wait for user to stop typing
 *   3. isStampHolder()       — if someone wrote after us, skip (they'll handle it)
 *   4. acquireLock()         — atomic SET NX — only one handler wins the lock
 *   5. isStampHolder() again — double-check: new message may have arrived between 3 and 4
 *   6. drainBuffer()         — get all buffered messages, clear the list
 *   7. [generate AI reply]
 *   8. releaseLock()         — free the lock so the next burst can proceed
 *
 * FALLBACK: if Redis is unavailable (env vars missing / connection error),
 * every function degrades gracefully so the pipeline still responds — just
 * without multi-message buffering. Set UPSTASH_REDIS_REST_URL + TOKEN to enable.
 */

// Redis key builders
const K = {
  buf:   (id: string) => `cubio:buf:${id}`,
  stamp: (id: string) => `cubio:stamp:${id}`,
  lock:  (id: string) => `cubio:lock:${id}`,
};

// TTLs (seconds) — safety nets so stale keys don't persist forever
const TTL = {
  buf:   300,   // 5 min
  stamp: 300,   // 5 min
  lock:  120,   // 2 min — auto-release if handler crashes mid-flight
};

/**
 * How long to wait after the LAST message before generating a reply.
 * Timer resets on every new message — so if user sends 4 messages 3s apart,
 * the AI responds 10s after the FOURTH message, with all 4 combined.
 */
export const DEBOUNCE_MS = 10000;

/** Returns false when Upstash env vars are not configured — skips all Redis ops. */
function redisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/**
 * Step 1 — Append message to the buffer list and claim the debounce stamp.
 * Every parallel handler calls this. The LAST one to write wins the stamp.
 */
export async function bufferAndClaim(
  conversationId: string,
  messageText: string,
  token: string,
): Promise<void> {
  if (!redisConfigured()) {
    console.warn('[buffer] Redis not configured — running without buffering');
    return;
  }
  console.info(`[buffer] append convId=${conversationId} token=${token} text="${messageText.slice(0, 60)}"`);
  try {
    // Pipeline: 3 commands → 1 HTTP round-trip to Upstash
    const pipe = redis.pipeline();
    pipe.rpush(K.buf(conversationId), messageText);
    pipe.expire(K.buf(conversationId), TTL.buf);
    pipe.set(K.stamp(conversationId), token, { ex: TTL.stamp });
    await pipe.exec();
  } catch (err) {
    console.error('[buffer] bufferAndClaim error (non-fatal):', err);
  }
}

/** Step 3 / Step 5 — returns false when a newer handler has claimed the stamp. */
export async function isStampHolder(conversationId: string, token: string): Promise<boolean> {
  if (!redisConfigured()) return true;
  try {
    const current = await redis.get<string>(K.stamp(conversationId));
    const holds = current === token;
    if (!holds) {
      console.info(`[buffer] stamp MISS convId=${conversationId} expected=${token} got=${current}`);
    }
    return holds;
  } catch (err) {
    console.error('[buffer] isStampHolder error (fail-open):', err);
    return true;
  }
}

/** Step 4 — atomic SET NX lock. Returns true only for the one winner. */
export async function acquireLock(conversationId: string, token: string): Promise<boolean> {
  if (!redisConfigured()) return true;
  try {
    const result = await redis.set(K.lock(conversationId), token, { nx: true, ex: TTL.lock });
    const acquired = result === 'OK';
    console.info(`[buffer] lock ${acquired ? 'ACQUIRED' : 'BUSY'} convId=${conversationId} token=${token}`);
    return acquired;
  } catch (err) {
    console.error('[buffer] acquireLock error (fail-open):', err);
    return true;
  }
}

/** Step 6 — read all buffered messages in order and clear the list. */
export async function drainBuffer(conversationId: string): Promise<string[]> {
  if (!redisConfigured()) return [];
  try {
    // Pipeline: lrange + del in 1 HTTP round-trip
    const pipe = redis.pipeline();
    pipe.lrange(K.buf(conversationId), 0, -1);
    pipe.del(K.buf(conversationId));
    const results = await pipe.exec();
    const texts = ((results?.[0] ?? []) as string[]);
    console.info(`[buffer] drained ${texts.length} message(s) convId=${conversationId}`);
    return texts;
  } catch (err) {
    console.error('[buffer] drainBuffer error (returning empty):', err);
    return [];
  }
}

/** Step 8 — release the lock and clear the stamp. */
export async function releaseLock(conversationId: string): Promise<void> {
  if (!redisConfigured()) return;
  try {
    // Pipeline: 2 DELs in 1 HTTP round-trip
    const pipe = redis.pipeline();
    pipe.del(K.lock(conversationId));
    pipe.del(K.stamp(conversationId));
    await pipe.exec();
    console.info(`[buffer] lock released convId=${conversationId}`);
  } catch (err) {
    console.error('[buffer] releaseLock error (non-fatal):', err);
  }
}
