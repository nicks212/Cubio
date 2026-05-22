/**
 * Deterministic lead-analysis gate — zero Gemini calls.
 *
 * Runs in <1ms on every message AFTER the AI has replied.
 * Returns a `ShouldAnalyse` decision that tells the pipeline
 * whether to fire the expensive Gemini detectLeadAndEscalation call.
 *
 * All regex patterns imported from signals.ts (single source of truth).
 */

import {
  BUYING_INTENT_RE,
  PHONE_RE,
  ANGER_RE,
  QUALIFICATION_RE,
  SKIP_INTENTS_RE,
  BROWSE_ONLY_RE,
  PHOTO_ONLY_RE,
} from './signals';

export type ShouldAnalyse =
  | { lead: false; escalation: false }
  | { lead: true;  escalation: boolean }
  | { lead: false; escalation: true };

/**
 * Decides whether to invoke Gemini lead+escalation analysis.
 *
 * @param history        Full conversation history INCLUDING the latest AI reply
 * @param latestMessage  The raw customer message just processed
 * @param businessType   'real_estate' | 'craft_shop'
 */
export function shouldRunLeadAnalysis(
  history: Array<{ role: string; content: string }>,
  latestMessage: string,
  businessType: 'real_estate' | 'craft_shop',
): ShouldAnalyse {
  const msg = latestMessage.trim();

  // ── Always check escalation when anger/abuse detected ─────────────────
  const hasAnger = ANGER_RE.test(msg);

  // ── Hard skip: empty or purely social message ──────────────────────────
  if (!msg || SKIP_INTENTS_RE.test(msg)) {
    return hasAnger
      ? { lead: false, escalation: true }
      : { lead: false, escalation: false };
  }

  // ── Hard skip: pure photo request ─────────────────────────────────────
  if (PHOTO_ONLY_RE.test(msg) && !hasAnger) {
    return { lead: false, escalation: false };
  }

  // ── Minimum conversation depth ─────────────────────────────────────────
  // Need at least 2 user messages unless a phone number is already present
  // (fast flows: photos → confirm → name → phone can qualify in fewer turns).
  const userMessages = history.filter(m => m.role === 'user');
  const userText2 = userMessages.map(m => m.content).join('\n');
  const hasPhoneEarly = PHONE_RE.test(userText2);
  const minDepth = hasPhoneEarly ? 2 : 3;
  if (userMessages.length < minDepth) {
    return hasAnger
      ? { lead: false, escalation: true }
      : { lead: false, escalation: false };
  }

  // ── Full conversation text for multi-turn signal extraction ───────────
  const fullText = history.map(m => m.content).join('\n');
  const userText  = userMessages.map(m => m.content).join('\n');

  // ── Signal scoring ─────────────────────────────────────────────────────
  const hasPhone        = PHONE_RE.test(userText);
  const hasBuyingIntent = BUYING_INTENT_RE.test(userText);
  const hasQualification = QUALIFICATION_RE.test(userText);

  // Skip if latest message is pure browsing with no other signals
  if (BROWSE_ONLY_RE.test(msg) && !hasPhone && !hasBuyingIntent) {
    return hasAnger
      ? { lead: false, escalation: true }
      : { lead: false, escalation: false };
  }

  // ── Lead gate: require at least 2 of 3 positive signals ───────────────
  // (Gemini will then apply the strict 3-condition rule for final isLead)
  const positiveSignalCount = [hasPhone, hasBuyingIntent, hasQualification].filter(Boolean).length;

  // For craft shop, product name mention counts as qualification —
  // also check for product-like nouns (name + price in same conversation)
  const craftQualified = businessType === 'craft_shop'
    ? /[₾$]\d|\d\s*(?:₾|\$)|product|item|piece|სამკაულ|ბეჭედ|ყელსაბამ|სამაჯურ|ვყიდ|хочу\s+(?:браслет|кольцо|украшени)/i.test(fullText)
    : false;

  const runLead = positiveSignalCount >= 2 || (craftQualified && hasBuyingIntent);

  if (!runLead && !hasAnger) {
    return { lead: false, escalation: false };
  }

  return { lead: runLead, escalation: hasAnger || positiveSignalCount >= 2 };
}
