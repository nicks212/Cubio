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

/** How long to wait for the user to stop typing (milliseconds). */
export const DEBOUNCE_MS = 5000;

/**
 * Step 1 — Append message to the buffer list and claim the debounce stamp.
 * Every parallel handler calls this. The LAST one to write wins the stamp.
 */
export async function bufferAndClaim(
  conversationId: string,
  messageText: string,
  token: string,
): Promise<void> {
  console.info(`[buffer] append convId=${conversationId} token=${token} text="${messageText.slice(0, 60)}"`);
  await Promise.all([
    redis.rpush(K.buf(conversationId), messageText),
    redis.expire(K.buf(conversationId), TTL.buf),
    redis.set(K.stamp(conversationId), token, { ex: TTL.stamp }),
  ]);
}

/**
 * Step 3 / Step 5 — Check if our token still owns the debounce stamp.
 * Returns false if a newer message arrived and claimed the stamp after us.
 */
export async function isStampHolder(conversationId: string, token: string): Promise<boolean> {
  const current = await redis.get<string>(K.stamp(conversationId));
  const holds = current === token;
  if (!holds) {
    console.info(`[buffer] stamp check MISS convId=${conversationId} expected=${token} got=${current}`);
  }
  return holds;
}

/**
 * Step 4 — Atomically acquire the processing lock (SET NX).
 * Only ONE handler wins — all others get false and exit.
 */
export async function acquireLock(conversationId: string, token: string): Promise<boolean> {
  const result = await redis.set(K.lock(conversationId), token, { nx: true, ex: TTL.lock });
  const acquired = result === 'OK';
  console.info(`[buffer] lock ${acquired ? 'ACQUIRED' : 'BUSY'} convId=${conversationId} token=${token}`);
  return acquired;
}

/**
 * Step 6 — Read all buffered messages in order and atomically clear the list.
 * Returns the messages array. If empty, returns [].
 */
export async function drainBuffer(conversationId: string): Promise<string[]> {
  const messages = await redis.lrange<string>(K.buf(conversationId), 0, -1);
  const texts = (messages ?? []) as string[];
  if (texts.length > 0) {
    await redis.del(K.buf(conversationId));
  }
  console.info(`[buffer] drained ${texts.length} messages convId=${conversationId}`);
  return texts;
}

/**
 * Step 8 — Release the processing lock and clear the stamp.
 * Must be called after the reply is fully sent (or on any error path).
 */
export async function releaseLock(conversationId: string): Promise<void> {
  await Promise.all([
    redis.del(K.lock(conversationId)),
    redis.del(K.stamp(conversationId)),
  ]);
  console.info(`[buffer] lock released convId=${conversationId}`);
}
