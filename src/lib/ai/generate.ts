import { model } from './model';
import { buildGlobalSystemPrompt } from './prompts/global';
import { buildRealEstateSystemPrompt } from './prompts/real_estate';
import { buildCraftShopSystemPrompt } from './prompts/craft_shop';
import type { BusinessContext, ApartmentContext, ProductContext } from './types';

/**
 * Generates an AI reply by composing two prompt layers:
 *
 *   Layer 1 — Global rules (language, tone, accuracy, escalation, human takeover)
 *   Layer 2 — Business-type rules (recommendations, lead flow, data context)
 *
 * The final prompt is: [global] + [business] + [conversation history] + [current message]
 *
 * @param message             - Current customer message text
 * @param context             - Business data (apartments or products + description)
 * @param businessType        - 'real_estate' | 'craft_shop'
 * @param conversationHistory - Recent message history (role + content pairs)
 * @param imageUrl            - Optional image URL sent by the customer (for multimodal use)
 */
export async function generateReply(
  message: string,
  context: BusinessContext,
  businessType: 'real_estate' | 'craft_shop',
  conversationHistory: Array<{ role: string; content: string }> = [],
  imageUrl?: string,
  photosSent = false,
): Promise<string> {
  // ── Layer 1: Global rules ────────────────────────────────────────────
  const globalPrompt = buildGlobalSystemPrompt(photosSent);

  // ── Layer 2: Business-type rules + data ────────────────────────────────────────
  // Pass the user's current message so prompt builders can pre-filter catalog
  const businessPrompt = businessType === 'real_estate'
    ? buildRealEstateSystemPrompt(context as ApartmentContext, message)
    : buildCraftShopSystemPrompt(context as ProductContext, message);

  // ── First message detection ───────────────────────────────────────────────
  // History contains only user messages fetched before this turn, so
  // an empty (or single-entry) history means this is the opening message.
  const isFirstMessage = conversationHistory.filter(m => m.role === 'user').length === 0;

  // ── Conversation history (last 6 turns) ────────────────────────────────────
  const historyStr = conversationHistory
    .slice(-6)
    .map(m => `${m.role === 'ai' ? 'Assistant' : 'Customer'}: ${m.content}`)
    .join('\n');

  // ── Combined system prompt ────────────────────────────────────────────────
  const systemPrompt = [
    globalPrompt,
    '',
    businessPrompt,
  ].join('\n\n');

  // ── User turn ─────────────────────────────────────────────────────────────
  const userTurnParts: string[] = [];
  if (isFirstMessage) userTurnParts.push('[SYSTEM NOTE: This is the customer\'s FIRST message. Begin your reply with a natural greeting before answering.]');
  if (historyStr) userTurnParts.push(`CONVERSATION HISTORY:\n${historyStr}`);
  if (imageUrl) userTurnParts.push(`[Customer sent an image: ${imageUrl}]`);
  userTurnParts.push(`Customer: ${message}`);

  const fullPrompt = `${systemPrompt}\n\n${userTurnParts.join('\n')}\n\nAssistant:`;

  // Retry up to 3 times on transient errors (503 overload, 429 rate-limit).
  // Delays: 2s → 5s → 10s
  const retryDelays = [2000, 5000, 10000];
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      const result = await model.generateContent(fullPrompt);
      const text = result.response.text().trim();
      if (text) return text;
      // Gemini returned an empty string — treat as transient and retry
      console.warn(`[ai/generate] Attempt ${attempt + 1} — empty response, retrying`);
      lastErr = new Error('Empty response from Gemini');
      if (attempt === retryDelays.length) break;
      await new Promise<void>(r => setTimeout(r, retryDelays[attempt]));
      continue;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      const isTransient = status === 503 || status === 429;

      if (!isTransient || attempt === retryDelays.length) break;

      const delay = retryDelays[attempt];
      console.warn(`[ai/generate] Attempt ${attempt + 1} failed (${status}) — retrying in ${delay}ms`);
      await new Promise<void>(r => setTimeout(r, delay));
    }
  }

  console.error('[ai/generate] generateReply error:', lastErr);
  const isGeorgian = /[\u10D0-\u10FF]/.test(message);
  return isGeorgian
    ? 'გთხოვთ მოთმინება, ცოტა ხანში გიპასუხებთ.'
    : 'Thank you for your message. We will get back to you shortly.';
}
