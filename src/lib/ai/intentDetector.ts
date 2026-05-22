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

import { CHAT_ONLY_RE, PHOTO_RE, APT_PHOTO_RE, PROJ_PHOTO_RE } from './signals';
import { model } from './model';

export type MessageIntent = 'chat' | 'photos' | 'search';
export type PhotoType = 'apartment' | 'project' | 'any';

/** Purely Georgian script characters */
const GEORGIAN_SCRIPT_RE = /[\u10D0-\u10FF]/;

/**
 * Fast synchronous intent detection via regex.
 * Returns null when the message is ambiguous (short, no Georgian script, no clear English keywords).
 * In that case callers should follow up with classifyIntentAI().
 */
export function detectIntent(message: string): MessageIntent | null {
  const text = message.trim();
  if (!text) return 'chat';
  if (CHAT_ONLY_RE.test(text)) return 'chat';
  if (PHOTO_RE.test(text)) return 'photos';

  // If message is short AND contains no Georgian script AND no obvious English content,
  // it may be romanized Georgian — return null to signal AI classification is needed.
  const isShort = text.length < 120;
  const hasGeorgianScript = GEORGIAN_SCRIPT_RE.test(text);
  const hasEnglish = /\b(?:apartment|price|floor|room|bed|buy|cost|available|location|size|area|budget|visit|schedule|book|reserve|info|detail|tell\s+me|how\s+much|what\s+is)\b/i.test(text);
  if (isShort && !hasGeorgianScript && !hasEnglish) {
    return null; // ambiguous — let caller run AI classification
  }

  return 'search';
}

/**
 * AI-based intent classifier for ambiguous messages (romanized Georgian, mixed input, etc.).
 * Uses a minimal Gemini prompt (~30 input tokens) — runs in ~300ms.
 * Should be called in PARALLEL with DB queries so it adds no wall-clock latency.
 *
 * Returns 'photos', 'chat', or 'search'.
 */
export async function classifyIntentAI(message: string): Promise<MessageIntent> {
  const prompt = `You are a message classifier for a real estate sales chatbot.
Classify the customer message into exactly one category:
  PHOTOS  — customer wants to see photos/pictures/images of an apartment or building
  CHAT    — greeting, thanks, short acknowledgement, emoji only
  SEARCH  — anything else (price inquiry, availability, booking, etc.)

Customer message: "${message.replace(/"/g, "'")}"

Reply with a single word: PHOTOS, CHAT, or SEARCH`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      generationConfig: { maxOutputTokens: 5, temperature: 0, thinkingConfig: { thinkingBudget: 0 } } as any,
    });
    const raw = result.response.text().trim().toUpperCase();
    if (raw.includes('PHOTOS')) return 'photos';
    if (raw.includes('CHAT')) return 'chat';
    return 'search';
  } catch {
    // Gemini unavailable — fall back to 'search' (safe default)
    return 'search';
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