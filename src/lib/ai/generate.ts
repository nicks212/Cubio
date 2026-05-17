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
): Promise<string> {
  // ── Layer 1: Global rules ────────────────────────────────────────────────
  const globalPrompt = buildGlobalSystemPrompt();

  // ── Layer 2: Business-type rules + data ──────────────────────────────────
  const businessPrompt = businessType === 'real_estate'
    ? buildRealEstateSystemPrompt(context as ApartmentContext)
    : buildCraftShopSystemPrompt(context as ProductContext);

  // ── Conversation history (last 8 turns) ──────────────────────────────────
  const historyStr = conversationHistory
    .slice(-8)
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
  if (historyStr) userTurnParts.push(`CONVERSATION HISTORY:\n${historyStr}`);
  if (imageUrl) userTurnParts.push(`[Customer sent an image: ${imageUrl}]`);
  userTurnParts.push(`Customer: ${message}`);

  const fullPrompt = `${systemPrompt}\n\n${userTurnParts.join('\n')}\n\nAssistant:`;

  try {
    const result = await model.generateContent(fullPrompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('[ai/generate] generateReply error:', err);
    // Language-aware fallback — check for Georgian script in message
    const isGeorgian = /[\u10D0-\u10FF]/.test(message);
    return isGeorgian
      ? 'გთხოვთ მოთმინება, ცოტა ხანში გიპასუხებთ.'
      : 'Thank you for your message. We will get back to you shortly.';
  }
}
