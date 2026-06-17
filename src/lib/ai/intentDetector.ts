/**
 * Lightweight intent classifier — runs in <1ms before any DB or AI work.
 *
 * All regex patterns are centralized in signals.ts.
 *
 *   'chat'   — greeting / thanks / confirmation
 *              → skip loadBusinessContext; use micro-prompt
 *   'photos' — customer wants to see images
 *              → AI will emit SHOW_PHOTOS: identifier; backend sends attachments
 *   'search' — apartment/product queries, pricing, availability, etc.
 *              → normal full-context flow
 *
 * For ambiguous short messages (romanized Georgian, mixed scripts),
 * use classifyIntentAI() which runs a fast Gemini call in parallel with DB queries.
 */

import { CHAT_ONLY_RE, PHOTO_RE, APT_PHOTO_RE, PROJ_PHOTO_RE, BUSINESS_QUERY_RE } from './signals';
import { model } from './model';
import { persistAIUsage, type AIUsageContext } from './usage';

export type MessageIntent = 'chat' | 'photos' | 'search';
export type PhotoType = 'apartment' | 'project' | 'any';

/**
 * Fast synchronous intent detection via regex.
 * Returns null when the message is short and not a confident regex match,
 * signalling callers to run classifyIntentAI() in parallel with DB queries.
 */
export function detectIntent(message: string): MessageIntent | null {
  const text = message.trim();
  if (!text) return 'chat';
  // Order matters: a photo request often also contains business keywords
  // (e.g. "ფოტო მაჩვენე ისევ" — "მაჩვენე" is in BUSINESS_QUERY_RE). PHOTO_RE must
  // win so the turn routes to 'photos', not 'search'. CHAT_ONLY is checked first
  // because it is fully anchored to pure greetings and can never overlap the others.
  if (CHAT_ONLY_RE.test(text)) return 'chat';
  if (PHOTO_RE.test(text)) return 'photos';
  if (BUSINESS_QUERY_RE.test(text)) return 'search';

  // Any short message that didn't confidently match chat or photo is ambiguous —
  // could be a photo request in Georgian script ("ვნახოთ ბინა"), romanized Georgian
  // ("fotoebs chamiyaret"), or English ("let me see that one"), etc.
  // Return null so the caller runs classifyIntentAI() in parallel with DB queries.
  // Long messages (detailed search queries) are confident enough to skip AI classify.
  if (text.length < 150) {
    return null;
  }

  return 'search';
}

/**
 * AI-based intent classifier for ambiguous messages (romanized Georgian, mixed input, etc.).
 * Uses a minimal Gemini prompt (~30 input tokens) — runs in ~300ms.
 * Should be called in PARALLEL with DB queries so it adds no wall-clock latency.
 *
 * Returns the resolved intent plus a wantsEscalation flag for cases where the
 * classifier detects a human-operator request not caught by HUMAN_REQUEST_RE regex
 * (e.g. romanized Georgian "operatori minda" or mixed-script operator requests).
 */
export async function classifyIntentAI(
  message: string,
  usageContext?: Omit<AIUsageContext, 'feature' | 'model'>,
): Promise<{ intent: MessageIntent; wantsEscalation: boolean }> {
  // Compressed 4-label prompt — ~40 input tokens, 1-word output, 0 thinking
  const prompt = `Classify. One word only: PHOTOS, CHAT, SEARCH, or ESCALATE.
PHOTOS=wants images/photos. CHAT=pure greeting/thanks/acknowledgement or emoji-only message with no product content. ESCALATE=explicitly requests to be connected with a human operator or agent. SEARCH=everything else including product descriptions, questions about items, or messages mixing emoji with product content.
Message: "${message.replace(/"/g, "'")}"`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generationConfig: { maxOutputTokens: 5, temperature: 0, thinkingConfig: { thinkingBudget: 0 } } as any,
    });
    await persistAIUsage(
      usageContext ? { ...usageContext, feature: 'intent_classifier', model: 'gemini-2.5-flash' } : null,
      result.response.usageMetadata,
    );
    const raw = result.response.text().trim().toUpperCase();
    if (raw.includes('PHOTOS'))   return { intent: 'photos', wantsEscalation: false };
    if (raw.includes('CHAT'))     return { intent: 'chat',   wantsEscalation: false };
    if (raw.includes('ESCALATE')) return { intent: 'search', wantsEscalation: true  };
    return { intent: 'search', wantsEscalation: false };
  } catch {
    // Gemini unavailable — fall back to 'search' (safe default)
    return { intent: 'search', wantsEscalation: false };
  }
}

/**
 * For photo-intent messages, determines whether the customer wants
 * apartment-unit photos, project/building photos, or either.
 * Only meaningful when detectIntent() returned 'photos'.
 */
export function detectPhotoType(message: string): PhotoType {
  if (APT_PHOTO_RE.test(message)) return 'apartment';
  if (PROJ_PHOTO_RE.test(message)) return 'project';
  return 'any';
}