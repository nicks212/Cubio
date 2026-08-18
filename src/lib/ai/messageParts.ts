/**
 * Splits a debounced message burst into the separate things the customer asked.
 *
 * The webhook pipeline waits DEBOUNCE_MS after the last message and then joins every
 * buffered message with "\n". That single blob then served two purposes it is bad at:
 *
 *   1. RETRIEVAL — product search ran over the whole blob, so words from one question
 *      scored against products for another. A customer asking "do you have a physical
 *      store? and do you sell rudraksha?" had "physical" (from the store question)
 *      match a necklace whose description mentions physical balance, and the shop was
 *      told that necklace was a confident answer to the rudraksha question.
 *
 *   2. ANSWERING — the model saw one wall of text and typically answered whichever
 *      part it noticed, silently dropping the rest.
 *
 * Splitting restores the structure the customer actually sent: separate asks, in the
 * order they asked them. Retrieval then runs per ask (no cross-contamination) and the
 * prompt can require an answer to every one.
 *
 * Purely structural — punctuation, line breaks and length. No keywords, no product
 * names, no per-language rules, so it behaves the same in Georgian and English.
 */

/** Sentence terminators that end an ask in both scripts (incl. full-width forms). */
const TERMINATOR_RE = /([?!؟。！？]+|\.(?:\s|$))/;

/** Shortest run of text that can stand on its own as an ask rather than a fragment. */
const MIN_ASK_CHARS = 3;

/** A part with no letters or digits (bare punctuation, emoji) carries no question. */
const hasContent = (s: string): boolean => /[\p{L}\p{N}]/u.test(s);

/**
 * Breaks `text` into the customer's distinct asks, in the order they were written.
 *
 * Splits on message boundaries (newlines, since the buffer joins messages with "\n")
 * and on sentence terminators. Fragments too short to stand alone are folded back
 * into the preceding ask, so "50?" after "how much are the candles" stays attached.
 *
 * Always returns at least one entry for non-empty input — a single ask is the normal
 * case and must behave exactly as before.
 */
export function splitCustomerAsks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const asks: string[] = [];
  for (const line of trimmed.split('\n')) {
    // Keep terminators attached to the sentence they close (capture group in split).
    const pieces = line.split(TERMINATOR_RE);
    let current = '';
    for (const piece of pieces) {
      if (piece === undefined) continue;
      current += piece;
      if (TERMINATOR_RE.test(piece) && hasContent(current)) {
        asks.push(current.trim());
        current = '';
      }
    }
    if (current.trim()) asks.push(current.trim());
  }

  // Fold fragments and content-free bits back into the previous ask.
  const merged: string[] = [];
  for (const ask of asks) {
    const tooSmall = ask.length < MIN_ASK_CHARS || !hasContent(ask);
    if (tooSmall && merged.length > 0) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${ask}`.trim();
    } else if (!tooSmall) {
      merged.push(ask);
    }
  }

  return merged.length > 0 ? merged : [trimmed];
}

/**
 * True when the burst contains more than one distinct ask — the case where the reply
 * must cover every question instead of just the one the model happened to latch onto.
 */
export function hasMultipleAsks(text: string): boolean {
  return splitCustomerAsks(text).length > 1;
}

/**
 * Renders the asks as a numbered list for the system prompt, so the model sees the
 * customer's questions as separate items it must each answer, in order.
 */
export function formatAsksForPrompt(asks: string[]): string {
  return asks.map((a, i) => `  ${i + 1}. ${a}`).join('\n');
}

/** Minimal shape of a stored conversation turn (matches MessageHistoryEntry). */
type Turn = { role: string; content: string };

/**
 * Removes the messages of the current debounce burst from the history snapshot.
 *
 * Each webhook handler saves its own message to the DB immediately and only then waits
 * out the debounce, so the handler that finally wins the lock holds a snapshot that
 * already contains the earlier messages of the very burst it is about to answer. Those
 * messages are also inside the merged current turn, and sending both copies tells the
 * model the first question is settled history — it then answers only the newest part.
 *
 * Only TRAILING user turns are considered, and only while they match a drained message
 * verbatim, so genuinely older turns — including the same question asked in an earlier
 * exchange — are left untouched.
 */
export function dropBurstFromHistory<T extends Turn>(history: T[], bufferedTexts: string[]): T[] {
  if (bufferedTexts.length === 0) return history;
  const pending = new Set(bufferedTexts.map(t => t.trim()).filter(Boolean));
  if (pending.size === 0) return history;

  let end = history.length;
  while (end > 0) {
    const turn = history[end - 1];
    if (turn.role !== 'user') break;
    const content = turn.content.trim();
    if (!pending.has(content)) break;
    // Each buffered message removes at most one history turn, so a repeated question
    // from an earlier exchange cannot be swallowed too.
    pending.delete(content);
    end--;
  }
  return end === history.length ? history : history.slice(0, end);
}
