import { model } from './model';
import { buildGlobalSystemPrompt } from './prompts/global';
import { buildRealEstateSystemPrompt } from './prompts/real_estate';
import { buildCraftShopSystemPrompt } from './prompts/craft_shop';
import { extractConversationState, formatStateForPrompt } from './state';
import type { BusinessContext, ApartmentContext, ProductContext } from './types';
import type { MessageIntent } from './intentDetector';

/**
 * Generates an AI reply by composing two prompt layers:
 *
 *   Layer 1 — Global rules (language, tone, accuracy, escalation)
 *   Layer 2 — Business-type rules (recommendations, lead flow, data context)
 *
 * Optimizations vs previous version:
 *   - No image URLs anywhere in prompts (SHOW_PHOTOS identifier only)
 *   - Structured state injection replaces verbose raw history
 *   - Token guard: auto-compresses context when estimate exceeds MAX_INPUT_TOKENS
 *   - True multimodal: customer images passed inline to Gemini Flash vision
 *   - 'chat' intent skips all business context (micro-prompt)
 */

/** Token estimate — 1 token ≈ 2 chars for Georgian-heavy text (Georgian script is ~1 char/token in Gemini) */
const estimateTokens = (text: string): number => Math.ceil(text.length / 2);
const MAX_INPUT_TOKENS = 1800;

export async function generateReply(
  message: string,
  context: BusinessContext,
  businessType: 'real_estate' | 'craft_shop',
  conversationHistory: Array<{ role: string; content: string }> = [],
  imageUrl?: string | null,
  photosSent = false,
  intent: MessageIntent = 'search',
  imageBase64?: string | null,
  imageMimeType?: string | null,
): Promise<string> {
  // ── Chat intent: micro-prompt, skip all business context ─────────────────────
  if (intent === 'chat') {
    const microPrompt = `You are a warm sales assistant AI. Reply in Georgian if the customer writes Georgian, English otherwise. Keep your reply to 1–2 sentences max.\n\nCustomer: ${message}\n\nAssistant:`;
    const isGeo = /[\u10D0-\u10FF]/.test(message);
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const result = await model.generateContent(microPrompt);
        const usage = result.response.usageMetadata;
        console.info(`[ai/generate] tokens (chat) — in:${usage?.promptTokenCount ?? '?'} out:${usage?.candidatesTokenCount ?? '?'} total:${usage?.totalTokenCount ?? '?'}`);
        const text = result.response.text().trim();
        if (text) return text;
      } catch (err) {
        console.error(`[ai/generate] chat attempt ${attempt + 1} error:`, err);
      }
      if (attempt === 0) await new Promise<void>(r => setTimeout(r, 1000));
    }
    return isGeo ? 'კარგი!' : 'Got it!';
  }

  // ── Layer 1: Global rules ──────────────────────────────────────────────────
  // Photos: always allow SHOW_PHOTOS on photo intents regardless of photosSent flag.
  const globalPrompt = buildGlobalSystemPrompt(intent === 'photos' ? false : photosSent);

  // ── Layer 2: Business-type rules + compact inventory ──────────────────────
  const businessPrompt = businessType === 'real_estate'
    ? buildRealEstateSystemPrompt(context as ApartmentContext, message)
    : buildCraftShopSystemPrompt(context as ProductContext, message);

  // ── Structured state injection ─────────────────────────────────────────────
  // Replaces verbose history for the "what do we know" question.
  // State is extracted deterministically — zero Gemini calls.
  const state = extractConversationState(conversationHistory);
  const stateLine = formatStateForPrompt(state);

  // ── First-message detection ────────────────────────────────────────────────
  const isFirstMessage = conversationHistory.filter(m => m.role === 'user').length === 0;

  // ── Token-guarded history slice ────────────────────────────────────────────
  // Start with last 4 turns. If estimated tokens exceed budget, cut to 2 turns.
  // History is the main variable cost driver — everything else is roughly fixed.
  const systemPrompt = `${globalPrompt}\n\n${businessPrompt}`;
  const baseTokens = estimateTokens(systemPrompt) + estimateTokens(stateLine) + estimateTokens(message) + 80;

  let historyTurns = 4;
  if (baseTokens + estimateTokens(
    conversationHistory.slice(-4).map(m => m.content).join('')
  ) > MAX_INPUT_TOKENS) {
    historyTurns = 2;
    console.info(`[ai/generate] Token guard: reducing history to ${historyTurns} turns`);
  }

  const historyStr = conversationHistory
    .slice(-historyTurns)
    .map(m => `${m.role === 'ai' ? 'Assistant' : 'Customer'}: ${m.content}`)
    .join('\n');

  // ── Assemble prompt parts ──────────────────────────────────────────────────
  const userTurnParts: string[] = [];
  if (isFirstMessage) {
    userTurnParts.push('[SYSTEM NOTE: FIRST message. Begin reply with a natural greeting.]');
  }
  if (historyStr) {
    userTurnParts.push(`${stateLine}\n\nRECENT TURNS:\n${historyStr}`);
  } else {
    userTurnParts.push(stateLine);
  }
  userTurnParts.push(`Customer: ${message}`);

  const textPrompt = `${systemPrompt}\n\n${userTurnParts.join('\n')}\n\nAssistant:`;

  // ── Build Gemini content parts (multimodal when image supplied) ────────────
  type ContentPart = { text: string } | { inlineData: { data: string; mimeType: string } };
  let contentParts: ContentPart[];

  if (imageBase64 && imageMimeType) {
    // True multimodal: customer image passed inline for Gemini vision analysis.
    // Used for visual similarity + style matching recommendations.
    contentParts = [
      { text: textPrompt },
      { inlineData: { data: imageBase64, mimeType: imageMimeType } },
      { text: 'Analyze the image above in context of the conversation.' },
    ];
    console.info(`[ai/generate] Multimodal call with ${imageMimeType} image`);
  } else {
    contentParts = [{ text: textPrompt }];
  }

  // ── Gemini call with retry ─────────────────────────────────────────────────
  const retryDelays = [2000, 5000, 10000];
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      const result = await model.generateContent(contentParts.length === 1 ? textPrompt : contentParts);
      const usage = result.response.usageMetadata;
      console.info(`[ai/generate] tokens — in:${usage?.promptTokenCount ?? '?'} out:${usage?.candidatesTokenCount ?? '?'} total:${usage?.totalTokenCount ?? '?'} history:${historyTurns}t`);
      const text = result.response.text().trim();
      if (text) return text;
      console.warn(`[ai/generate] Attempt ${attempt + 1} — empty response, retrying`);
      lastErr = new Error('Empty response from Gemini');
      if (attempt === retryDelays.length) break;
      await new Promise<void>(r => setTimeout(r, retryDelays[attempt]));
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      // Retry on: rate-limit (429), overload (503), any 5xx, or unknown network error (status undefined)
      const isTransient = !status || status === 429 || status >= 500;
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
