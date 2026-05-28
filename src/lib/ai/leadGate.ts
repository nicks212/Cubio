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
  HUMAN_REQUEST_RE,
  FRUSTRATION_GATE_RE,
  QUALIFICATION_RE,
  SKIP_INTENTS_RE,
  BROWSE_ONLY_RE,
  PHOTO_ONLY_RE,
  PRODUCT_DISSATISFIED_RE,
} from './signals';

export type ShouldAnalyse =
  | { lead: false; escalation: false }
  | { lead: true;  escalation: boolean }
  | { lead: false; escalation: true };

/**
 * Decides whether to invoke lead+escalation analysis.
 *
 * @param history          Full conversation history INCLUDING the latest AI reply
 * @param latestMessage    The raw customer message just processed
 * @param businessType     'real_estate' | 'craft_shop'
 * @param lastShownAptId   Apartment last shown via SHOW_PHOTOS (from DB) — counts as qualification
 */
export function shouldRunLeadAnalysis(
  history: Array<{ role: string; content: string }>,
  latestMessage: string,
  businessType: 'real_estate' | 'craft_shop',
  lastShownAptId: string | null = null,
): ShouldAnalyse {
  const msg = latestMessage.trim();

  // ── Unresolved attempts: user sent searchable queries but AI listed no products ──
  // This is the key precondition for firing the expensive frustration AI scorer.
  // Without it, single frustration words on normal price/availability questions trigger
  // unnecessary Gemini calls that often return low scores anyway.
  let unresolvedAttempts = 0;
  for (let i = 0; i < history.length - 1; i++) {
    const h = history[i];
    if (h.role !== 'user') continue;
    const c = h.content.trim();
    if (!c || c.length < 3 || SKIP_INTENTS_RE.test(c) || PHOTO_ONLY_RE.test(c)) continue;
    const nextAi = history.slice(i + 1).find(m => m.role === 'ai' || m.role === 'model');
    if (nextAi && !/^\s*•\s+\S/m.test(nextAi.content) && !/SHOW_PHOTOS/i.test(nextAi.content)) {
      unresolvedAttempts++;
    }
  }

  // ── Escalation gate ─────────────────────────────────────────────────────
  // hasExplicitHumanReq: customer directly asked for a person/operator — always check
  // hasFrustrationWithContext: frustration signal present AND >= 2 turns went unresolved.
  //   Without the unresolved context, single frustration words (e.g. "ძვირია" = it's expensive)
  //   on normal browsing turns would fire the AI scorer unnecessarily.
  const hasExplicitHumanReq = HUMAN_REQUEST_RE.test(msg);
  const mightBeFrustrated   = FRUSTRATION_GATE_RE.test(msg);
  const recentUserHistory = history
    .filter(m => m.role === 'user')
    .slice(-3)
    .map(m => m.content)
    .join('\n');
  const hasFrustrationWithContext =
    (mightBeFrustrated || FRUSTRATION_GATE_RE.test(recentUserHistory)) && unresolvedAttempts >= 2;
  const checkEscalation = hasExplicitHumanReq
    || HUMAN_REQUEST_RE.test(recentUserHistory)
    || hasFrustrationWithContext;

  // ── Hard skip: empty or purely social message ──────────────────────────
  if (!msg || SKIP_INTENTS_RE.test(msg)) {
    return checkEscalation
      ? { lead: false, escalation: true }
      : { lead: false, escalation: false };
  }

  // ── Hard skip: pure photo request ───────────────────────────────────────────
  if (PHOTO_ONLY_RE.test(msg) && !checkEscalation) {
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
    return checkEscalation
      ? { lead: false, escalation: true }
      : { lead: false, escalation: false };
  }

  // ── Full conversation text for multi-turn signal extraction ───────────
  const fullText = history.map(m => m.content).join('\n');
  const userText  = userMessages.map(m => m.content).join('\n');

  // ── Signal scoring ─────────────────────────────────────────────────────
  const hasPhone        = PHONE_RE.test(userText);
  const hasBuyingIntent = BUYING_INTENT_RE.test(userText);
  // lastShownAptId counts as qualification — customer has viewed a specific apartment
  const hasQualification = QUALIFICATION_RE.test(userText) || !!lastShownAptId;

  // Skip if latest message is pure browsing with no other signals
  if (BROWSE_ONLY_RE.test(msg) && !hasPhone && !hasBuyingIntent) {
    return checkEscalation
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

  // ── Craft shop: dissatisfied customer → always create a lead ──────────
  // Customer has seen products but nothing matched — we want to capture their
  // contact so the shop can follow up. Guard: need ≥ 2 user messages to confirm
  // the dissatisfaction is post-product-listing (state.ts enforces this too, but
  // belt-and-suspenders here avoids firing on the very first message).
  if (businessType === 'craft_shop' && PRODUCT_DISSATISFIED_RE.test(msg)) {
    const userMsgCount = history.filter(m => m.role === 'user').length;
    const aiHasListedProducts = history.some(
      m => (m.role === 'ai' || m.role === 'model') && /^\s*•\s+\S/m.test(m.content),
    );
    if (userMsgCount >= 2 && aiHasListedProducts) {
      return { lead: true, escalation: checkEscalation };
    }
  }

  const runLead = positiveSignalCount >= 2 || (craftQualified && hasBuyingIntent);

  if (!runLead && !checkEscalation) {
    return { lead: false, escalation: false };
  }

  return { lead: runLead, escalation: checkEscalation || positiveSignalCount >= 2 };
}
