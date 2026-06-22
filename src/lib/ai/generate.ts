import { model } from './model';
import { buildGlobalSystemPrompt, LANGUAGE_RULE } from './prompts/global';
import { buildRealEstateSystemPrompt } from './prompts/real_estate';
import { buildCraftShopSystemPrompt } from './prompts/craft_shop';
import { buildBeautySalonSystemPrompt } from './prompts/beauty_salon';
import { extractConversationState, formatStateForPrompt } from './state';
import { BUYING_INTENT_RE, PHOTO_RE, TRANSACTION_INTENT_RE } from './signals';
import { persistAIUsage, type AIUsageContext } from './usage';
import type { BusinessContext, ApartmentContext, ProductContext, ServiceContext } from './types';
import type { MessageIntent } from './intentDetector';
import { isProductBusiness, type BusinessType } from '@/types/database';

/**
 * Per-profile copy used in the chat micro-prompt: the domain fence (what the
 * assistant must never talk about) and the assistant's scope for the first-message
 * AI disclosure. Centralised so adding a profile is one entry, not scattered ternaries.
 */
const PROFILE_COPY: Record<BusinessType, { domainFence: string; scope: string }> = {
  real_estate: {
    domainFence: 'You work only for a real-estate company. Never mention jewelry, gifts, zodiac, birthstones, candles, oils, incense, souvenirs, or craft-shop products.',
    scope: 'help find properties, answer questions, and arrange a viewing',
  },
  craft_shop: {
    domainFence: 'You work only for a craft shop. Never mention apartments, projects, neighborhoods, rooms, floors, square meters, developers, investments, or real-estate services.',
    scope: 'help find products, answer questions, and assist with orders',
  },
  shop: {
    domainFence: 'You work only for a retail shop. Never mention apartments, projects, neighborhoods, rooms, floors, square meters, developers, investments, or real-estate services.',
    scope: 'help find products, answer questions, and assist with orders',
  },
  beauty_salon: {
    domainFence: 'You work only for a beauty / aesthetics service business (salon, clinic, barber, nail/skincare studio, or grooming). Never mention real estate, apartments, or unrelated retail products. Focus on the business’s services, specialists, and appointments.',
    scope: 'help find the right service, answer questions, and book an appointment',
  },
};

/**
 * Generates an AI reply using Gemini's native multi-turn chat API.
 *
 * Key changes vs. the previous text-blob approach:
 *   - History is passed as structured Content[] turns, NOT concatenated into a text blob.
 *     This prevents the model treating "[AI] ... [USER] ..." as a template to reproduce,
 *     which was the root cause of cascading/snowballing replies.
 *   - Current user message is ALWAYS the final turn — never present in history.
 *   - System instruction carries: global rules + business rules + conversation state.
 *   - isFirstMessage flag controls whether the model greets (backend-driven, not prompt-driven).
 *   - 'chat' intent skips business context and uses a lean micro-prompt.
 */

/** Token estimate — 1 token ≈ 2 chars for Georgian-heavy text */
const estimateTokens = (text: string): number => Math.ceil(text.length / 2);
const MAX_INPUT_TOKENS = 2000;

// Local types for Gemini multi-turn API (compatible with SDK Content/Part types)
type GeminiPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };
type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] };

export async function generateReply(
  message: string,
  context: BusinessContext,
  businessType: BusinessType,
  conversationHistory: Array<{ role: string; content: string }> = [],
  imageUrl?: string | null,
  photosSent = false,
  intent: MessageIntent = 'search',
  imageBase64?: string | null,
  imageMimeType?: string | null,
  /** True only on the very first message of a fresh conversation. */
  isFirstMessage = false,
  /** Last apartment shown via SHOW_PHOTOS — seeded from DB when not in history slice. */
  lastShownAptId: string | null = null,
  /**
   * When true, backend has detected a condition it cannot resolve (no inventory, custom
   * request, explicit human ask). AI should include a brief offer to connect the customer
   * with a representative and ask if they'd like that. One sentence, no apologies.
   */
  offerEscalation = false,
  /** Single language authority, computed upstream from the current customer message. */
  replyLanguage: 'ka' | 'en' = 'en',
  usageContext?: Omit<AIUsageContext, 'feature' | 'model'>,
): Promise<string> {
  // ── Chat intent: lean micro-prompt, no business context ───────────────────
  if (intent === 'chat') {
    // Inject a short business hint so the AI responds contextually to openers like
    // "I saw an ad", "someone referred me", "vnaxe reklama" — instead of the ACCURACY fallback.
    // Truncated to 120 chars to keep the micro-prompt lean.
    const bizCtx = (context as { businessDescription?: string | null }).businessDescription;
    const bizHint = bizCtx ? ` for: ${bizCtx.slice(0, 120)}` : '';
    const domainFence = PROFILE_COPY[businessType].domainFence;
    // First message of a new conversation → warm greeting + transparent AI disclosure
    // (phrased naturally by the model, not a fixed sentence). Only here, never repeated.
    const firstMsgDisclosure = isFirstMessage
      ? `This is their very first message: you MUST open with a warm greeting AND clearly tell them — naturally, in your own words, never a canned line — that they're chatting with the business's AI assistant who can ${PROFILE_COPY[businessType].scope}. This transparency is required on this first message only. `
      : '';
    const chatSystemInstruction =
      `You are a warm, natural sales assistant${bizHint}. ` +
      `${domainFence} ` +
      `${LANGUAGE_RULE} ` +
      `${firstMsgDisclosure}` +
      `1–2 sentences max. Be conversational. ` +
      `If company details are limited, ask one short clarifying question instead of guessing. ` +
      `If they mention seeing an ad or coming to inquire — warmly ask what they are looking for. ` +
      `If they say thanks, say you're welcome. If they say goodbye, wish them well.`;
    const isGeo = replyLanguage === 'ka';
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const result = await model.generateContent({
          systemInstruction: { role: 'system', parts: [{ text: chatSystemInstruction }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
        });
        const usage = result.response.usageMetadata;
        console.info(`[ai/generate] tokens (chat) — in:${usage?.promptTokenCount ?? '?'} out:${usage?.candidatesTokenCount ?? '?'} total:${usage?.totalTokenCount ?? '?'}`);
        const text = result.response.text().trim();
        if (text) {
          await persistAIUsage(
            usageContext ? { ...usageContext, feature: 'reply_chat', model: 'gemini-2.5-flash' } : null,
            usage,
          );
          return text;
        }
      } catch (err) {
        console.error(`[ai/generate] chat attempt ${attempt + 1} error:`, err);
      }
      if (attempt === 0) await new Promise<void>(r => setTimeout(r, 1000));
    }
    return isGeo ? 'კარგი!' : 'Got it!';
  }

  // ── Layer 1: Global rules ──────────────────────────────────────────────────
  // When the message contains any photo signal, always tell the AI "no photos sent yet"
  // so it emits SHOW_PHOTOS rather than saying "photos were already sent".
  // Backend delivery is unconditional when explicitPhotoRequest=true anyway.
  const globalPrompt = buildGlobalSystemPrompt(
    (intent === 'photos' || PHOTO_RE.test(message)) ? false : photosSent,
  );

  // ── Conversation state (deterministic, zero AI calls) ───────────────────────────────────────────
  const state = extractConversationState(conversationHistory);
  // Seed lastShownAptId from DB if not present in the history slice
  if (!state.lastShownAptId && lastShownAptId) state.lastShownAptId = lastShownAptId;
  const stateLine = formatStateForPrompt(state);

  // ── Layer 2: Business-type rules + compact inventory ──────────────────────────
  const businessPrompt =
    businessType === 'real_estate'
      ? buildRealEstateSystemPrompt(context as ApartmentContext, message)
      : businessType === 'beauty_salon'
        ? buildBeautySalonSystemPrompt(context as ServiceContext, message, { replyLanguage })
        : buildCraftShopSystemPrompt(context as ProductContext, message, {
            buyingIntent: state.buyingIntent || BUYING_INTENT_RE.test(message),
            productDissatisfied: state.productDissatisfied,
            photoIntent: intent === 'photos',
            transactional: TRANSACTION_INTENT_RE.test(message),
            replyLanguage,
            businessType,
          });

  // ── System instruction ─────────────────────────────────────────────────────
  const systemParts: string[] = [`${globalPrompt}\n\n${businessPrompt}`, stateLine];
  // Catalog grounding is already stated authoritatively in TWO layered prompts that
  // are always part of systemParts[0] for non-chat turns:
  //   • global.ts  → PRICES / ACCURACY (layer 1, both business types)
  //   • craft_shop.ts → CATALOG RULE   (layer 2, craft shop)
  // A third runtime-injected "CATALOG AUTHORITY" copy here was redundant (~90 tokens
  // every craft turn) and stated nothing the two layers don't already enforce.
  if (!isFirstMessage) {
    // Hard constraint — injected FIRST so it overrides the model's tendency to greet
    systemParts.unshift('NO GREETING: Do NOT use გამარჯობა, hello, hi, or any greeting. Start directly with your answer.');
  }
  if (isFirstMessage) {
    systemParts.push(
      `FIRST MESSAGE (new conversation): Open with a brief, warm greeting and, in your own natural words, transparently let the customer know they're chatting with the business's AI assistant who can ${PROFILE_COPY[businessType].scope} — then answer their question in the same message. ~2 short sentences. Warm, not robotic. Do this disclosure ONLY now; never repeat it on later turns.`,
    );
  }
  if (offerEscalation) {
    systemParts.push(
      'ESCALATION (this turn only): Include a brief, natural offer to connect the customer with a company representative — one sentence, no apologies. Ask if they would like that.',
    );
  }
  const systemInstructionText = systemParts.filter(Boolean).join('\n\n');

  // ── Token-guarded history slice ────────────────────────────────────────────
  // Photo flows need more history for apartment follow-up detection. craft_shop uses 4 turns:
  // enough to follow multi-turn references ("show me another", "do you have similar?", "I like
  // this") without bloating tokens. Price contamination is no longer a concern — the current
  // price is always re-injected into PRODUCTS (reference resolution) and CATALOG AUTHORITY
  // forbids quoting history prices, so a slightly longer window is safe.
  const isPhotoFlow = photosSent || !!lastShownAptId || intent === 'photos';
  // Real-estate photo flows need a deeper window for apartment follow-up detection.
  // Craft shop and beauty salon use 4 turns: enough for multi-turn references
  // ("show me another", "do you have similar?", "book me with Anna instead") without bloat.
  const isMultiTurnProfile = isProductBusiness(businessType) || businessType === 'beauty_salon';
  const historyTurns = (isPhotoFlow && businessType === 'real_estate') ? 6
    : isMultiTurnProfile ? 4
    : 3;

  // ── Build Gemini multi-turn history ───────────────────────────────────────
  // Rules:
  //   1. Filter out synthetic SHOW_PHOTOS-only AI entries (internal markers, not real dialogue)
  //   2. Merge consecutive same-role turns (Gemini requires strict user/model alternation)
  //   3. Drop any leading model turns (Gemini history MUST start with user)
  const historySlice = conversationHistory
    .slice(-historyTurns)
    .filter(m => !(m.role === 'ai' && /^SHOW_PHOTOS:/i.test(m.content.trim())))
    // Prevent Gemini from mirroring the conversation's prior language: when this turn
    // must be answered in English, drop any history turn that still contains Georgian
    // script (the assistant's earlier replies carry Georgian product names). Structured
    // facts (budget, rooms, etc.) are preserved separately in the STATE line, so removing
    // these raw turns loses no grounding. Georgian turns are kept when answering in Georgian.
    .filter(m => replyLanguage !== 'en' || !/[ა-ჿ]/.test(m.content));

  const geminiHistory: GeminiContent[] = [];
  for (const turn of historySlice) {
    const role: 'user' | 'model' = turn.role === 'ai' ? 'model' : 'user';
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === role) {
      // Merge consecutive same-role turns (e.g. multi-message debounce bursts)
      (geminiHistory[geminiHistory.length - 1].parts as { text: string }[]).push({
        text: '\n' + turn.content,
      });
    } else {
      geminiHistory.push({ role, parts: [{ text: turn.content }] });
    }
  }
  // Ensure history starts with a user turn
  while (geminiHistory.length > 0 && geminiHistory[0].role === 'model') geminiHistory.shift();

  console.info(
    `[ai/generate] history turns:${geminiHistory.length} isFirst:${isFirstMessage} intent:${intent}`,
  );

  // ── Current message parts (multimodal when image supplied) ────────────────
  const currentParts: GeminiPart[] =
    imageBase64 && imageMimeType
      ? [
          { text: message },
          { inlineData: { data: imageBase64, mimeType: imageMimeType } },
          { text: 'Analyze the image above in context of the conversation.' },
        ]
      : [{ text: message }];

  if (imageBase64) console.info(`[ai/generate] Multimodal call with ${imageMimeType} image`);

  // ── Gemini multi-turn call with retry ─────────────────────────────────────
  const retryDelays = [2000, 5000, 10000];
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      // Each retry creates a fresh chat session (stateless — history + system are re-sent)
      const chat = model.startChat({
        // Gemini API requires Content object format, not a plain string
        systemInstruction: { role: 'system', parts: [{ text: systemInstructionText }] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        history: geminiHistory as any,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await chat.sendMessage(currentParts as any);
      const usage = result.response.usageMetadata;
      console.info(
        `[ai/generate] tokens — in:${usage?.promptTokenCount ?? '?'} out:${usage?.candidatesTokenCount ?? '?'} total:${usage?.totalTokenCount ?? '?'} hist:${geminiHistory.length}t`,
      );
      const text = result.response.text().trim();
      if (text) {
        await persistAIUsage(
          usageContext ? { ...usageContext, feature: 'reply_main', model: 'gemini-2.5-flash' } : null,
          usage,
        );
        return text;
      }
      console.warn(`[ai/generate] Attempt ${attempt + 1} — empty response, retrying`);
      lastErr = new Error('Empty response from Gemini');
      if (attempt === retryDelays.length) break;
      await new Promise<void>(r => setTimeout(r, retryDelays[attempt]));
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number }).status;
      const isTransient = !status || status === 429 || status >= 500;
      if (!isTransient || attempt === retryDelays.length) break;
      const delay = retryDelays[attempt];
      console.warn(`[ai/generate] Attempt ${attempt + 1} failed (${status}) — retrying in ${delay}ms`);
      await new Promise<void>(r => setTimeout(r, delay));
    }
  }

  console.error('[ai/generate] generateReply error:', lastErr);
  return replyLanguage === 'ka'
    ? 'გთხოვთ მოთმინება, ცოტა ხანში გიპასუხებთ.'
    : 'Thank you for your message. We will get back to you shortly.';
}
