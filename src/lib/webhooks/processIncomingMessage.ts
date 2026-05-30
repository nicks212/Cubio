import { createAdminClient } from '@/lib/supabase/server';
import { generateReply } from '@/lib/ai';
import { analyzeLeadState } from '@/lib/leads/detector';
import { CANCEL_RE, BROWSE_AGAIN_RE, PHONE_EXTRACT_RE, HUMAN_REQUEST_RE, CUSTOM_REQUEST_RE, ESCALATION_CONFIRM_RE, FRUSTRATION_GATE_RE, PHOTO_RE, BUSINESS_QUERY_RE } from '@/lib/ai/signals';
import { detectLeadAndEscalation } from '@/lib/ai/detect';
import { identifyCompany } from './identifyCompany';
import { loadBusinessContext } from './loadBusinessContext';
import { sendProviderResponse, sendImageUrls } from './sendProviderResponse';
import { bufferAndClaim, isStampHolder, acquireLock, drainBuffer, releaseLock, DEBOUNCE_MS } from './messageBuffer';
import { detectIntent, detectPhotoType, classifyIntentAI } from '@/lib/ai/intentDetector';
import { shouldRunLeadAnalysis } from '@/lib/ai/leadGate';
import { describeImageForSearch, searchSimilarApartments, searchSimilarProducts } from '@/lib/ai/embeddings';
import { persistAIUsage } from '@/lib/ai/usage';
import { normalizeQuery, retrieveProducts } from '@/lib/ai/productRetrieval';
import { redis } from '@/lib/redis';
import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { NormalizedMessage, ProcessResult, MessageHistoryEntry } from './types';
import type { ApartmentContext, ProductContext, BusinessContext } from '@/lib/ai/types';
import type { PhotoType } from '@/lib/ai/intentDetector';

const CRAFT_BROAD_QUERY_RE = /what\s+do\s+you\s+(?:sell|have)|what\s+(?:products|items)\s+do\s+you\s+have|what'?s\s+available|catalog|shop|store|რას\s*(?:ყიდით|გაქვთ)|რა\s*გაქვთ|რა\s*იყიდება|კატალოგ|მაღაზია/i;
const CRAFT_RECOMMENDATION_RE = /\b(?:recommend|suggest|offer|we\s+have|try|look\s+at|შემოგთავაზ|გირჩევ|გთავაზობთ|გვაქვს)\b/i;

/**
 * Core processing pipeline — shared across all providers.
 *
 * 1.  Identify company via integration lookup
 * 2.  Find or create conversation — check ai_paused (human takeover)
 * 3.  Save incoming user message
 * 4.  If ai_paused → store message, skip AI, return early
 * 5.  Typing debounce — wait briefly, skip if a newer message arrived
 * 6.  Load business context
 * 7.  Load recent message history (last 10 turns)
 * 8.  Generate AI reply (Layer 1 global + Layer 2 business-type)
 * 9.  Save AI reply
 * 10. Send reply via provider API
 * 11. Fire-and-forget: detect lead / escalation — auto-pause if escalated
 */
export async function processIncomingMessage(
  msg: NormalizedMessage,
): Promise<ProcessResult | null> {
  const supabase = createAdminClient();
  const label = `[${msg.provider}/${msg.providerAccountId}]`;

  // 1. Identify company integration
  const integration = await identifyCompany(msg.provider, msg.providerAccountId);
  if (!integration) {
    console.warn(`${label} No matching integration found`);
    return null;
  }

  if (!integration.aiEnabled) {
    console.info(`${label} AI disabled for company ${integration.companyId}`);
    return null;
  }

  // Resolve sender name from provider API (Meta webhooks don’t include the user’s name)
  let resolvedName: string | null = msg.senderName ?? null;
  // For Instagram: @handle stored separately as provider_nickname (handle identifies the account)
  // For Facebook: same as display name (no separate handle concept)
  let resolvedNickname: string | null = msg.senderName ?? null;
  if (!resolvedName && (msg.provider === 'facebook' || msg.provider === 'instagram')) {
    const resolved = await resolveMetaSenderName(
      msg.senderId,
      msg.provider as 'facebook' | 'instagram',
      integration.accessToken,
      integration.providerAccountId, // page ID — used for Conversations API fallback
    );
    resolvedName = resolved.name;
    resolvedNickname = resolved.nickname;
    if (resolvedName || resolvedNickname) console.info(`${label} Resolved sender name: ${resolvedName ?? resolvedNickname}`);
  }

  // 2. Find or create conversation — read ai_paused for human takeover check
  let conversationId: string;
  let aiPaused = false;
  let photosSent = false;
  let lastShownApt: string | null = null;

  const { data: existing } = await supabase
    .from('conversations')
    .select('id, ai_paused, contact_name, photos_sent, last_shown_apt')
    .eq('company_id', integration.companyId)
    .eq('provider', msg.provider)
    .eq('provider_conversation_id', msg.senderId)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    conversationId = existing.id as string;
    aiPaused = (existing.ai_paused as boolean | null) ?? false;
    photosSent = (existing.photos_sent as boolean | null) ?? false;
    lastShownApt = (existing.last_shown_apt as string | null) ?? null;
    // Back-fill contact_name if we resolved a name but the record was created without one
    if (resolvedName && !(existing.contact_name as string | null)) {
      await supabase.from('conversations').update({ contact_name: resolvedName }).eq('id', conversationId);
      // Cascade to leads and escalations that were created with null contact_name
      await Promise.all([
        supabase.from('leads')
          .update({ name: resolvedName, provider_nickname: resolvedNickname ?? resolvedName })
          .eq('conversation_id', conversationId)
          .is('name', null),
        supabase.from('escalations')
          .update({ contact_name: resolvedName, provider_nickname: resolvedNickname ?? resolvedName })
          .eq('conversation_id', conversationId)
          .is('contact_name', null),
      ]);
    }
  } else {
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({
        company_id: integration.companyId,
        integration_id: integration.integrationId,
        provider: msg.provider,
        provider_conversation_id: msg.senderId,
        contact_name: resolvedName,
        status: 'open',
        ai_paused: false,
      })
      .select('id')
      .single();

    if (createErr || !created) {
      console.error(`${label} Failed to create conversation:`, createErr?.message);
      return null;
    }
    conversationId = created.id as string;
    console.info(`${label} Created conversation ${conversationId} for sender ${msg.senderId}`);
  }

  // 3. Idempotency guard — skip if we already processed this provider message ID
  if (msg.messageId) {
    const { data: alreadyProcessed } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('provider_message_id', msg.messageId)
      .maybeSingle();

    if (alreadyProcessed) {
      console.info(`${label} Duplicate event for message ${msg.messageId} — skipping`);
      return null;
    }
  }

  // 3b. Content-hash dedup — catches webhook retries without a message ID,
  //     and race-condition duplicates within a 30-second window.
  //     Uses Redis SET NX (non-blocking) so it never blocks the pipeline.
  try {
    const msgHash = createHash('sha256')
      .update(`${conversationId}:${msg.messageText}:${msg.imageUrl ?? ''}`)
      .digest('hex')
      .slice(0, 20);
    const hashKey = `cubio:msgdedupe:${msgHash}`;
    const wasNew = await redis.set(hashKey, '1', { ex: 30, nx: true });
    if (wasNew === null) {
      console.info(`${label} Duplicate content fingerprint — skipping`);
      return null;
    }
  } catch {
    // Redis unavailable — continue without hash dedup (idempotency guard above still applies)
  }

  // 3c. History snapshot — loaded BEFORE saving the current message so this turn's
  //     text is not included in the context history passed to the AI.
  //     isFirstMessage: true only when there are zero prior user turns in DB.
  const { data: historySnapshot } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10)
    .then(r => r);
  const preloadedHistory: MessageHistoryEntry[] = ((historySnapshot ?? []) as MessageHistoryEntry[]).reverse();
  const isFirstMessage = !photosSent && preloadedHistory.filter(m => m.role === 'user').length === 0;
  console.info(`${label} [history] snapshot: ${preloadedHistory.length} turns, isFirstMessage:${isFirstMessage}`);

  // 4. Save incoming message — capture ID + created_at for debounce check
  const { data: savedMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      company_id: integration.companyId,
      role: 'user',
      content: msg.messageText,
      provider_message_id: msg.messageId ?? null,
    })
    .select('id')
    .single();

  const savedMessageId = (savedMsg?.id as string | undefined) ?? null;

  // 5. Human takeover — message stored, AI skips response
  if (aiPaused) {
    console.info(`${label} Conversation ${conversationId} is paused (human takeover) — message saved, AI skipped`);
    return { conversationId, reply: null };
  }

  // 5a. Append this message to the Redis buffer and claim the debounce stamp.
  //     Every parallel webhook handler does this. The LAST one to write wins the stamp.
  const myToken = savedMessageId ?? crypto.randomUUID();
  await bufferAndClaim(conversationId, msg.messageText, myToken);
  console.info(`${label} [debounce] message buffered, waiting ${DEBOUNCE_MS}ms for user to finish typing`);

  // 5b. Wait for user to stop typing.
  await new Promise<void>(r => setTimeout(r, DEBOUNCE_MS));

  // 5c. Are we still the last message? If not, a newer handler will respond — we exit.
  if (!(await isStampHolder(conversationId, myToken))) {
    console.info(`${label} [debounce] newer message arrived — skipping (conversation ${conversationId})`);
    return { conversationId, reply: null };
  }

  // 5d. Acquire the processing lock — only ONE handler passes this per conversation.
  //     If another handler already has the lock, exit (it will handle this burst).
  if (!(await acquireLock(conversationId, myToken))) {
    console.info(`${label} [debounce] lock busy — another handler is processing, skipping (conversation ${conversationId})`);
    return { conversationId, reply: null };
  }

  // 5e. Double-check stamp after acquiring lock — a new message may have arrived
  //     between step 5c and 5d. If so, release lock and let that handler respond.
  if (!(await isStampHolder(conversationId, myToken))) {
    await releaseLock(conversationId);
    console.info(`${label} [debounce] stamp changed after lock acquired — releasing, skipping (conversation ${conversationId})`);
    return { conversationId, reply: null };
  }

  // 5f. Drain the buffer — all messages the user sent since the last AI reply.
  const bufferedTexts = await drainBuffer(conversationId);
  let combinedMessage = bufferedTexts.length > 0
    ? bufferedTexts.join('\n')
    : msg.messageText;
  console.info(`${label} [debounce] processing ${bufferedTexts.length} buffered message(s) for conversation ${conversationId}`);

  // 6-pre. Voice transcription — runs only when the customer sent a voice note.
  // Transcription happens AFTER debounce so we don't waste a Gemini call on a message
  // that will be skipped by the dedup/lock checks above.
  // On success: combinedMessage is replaced with the transcript text.
  // On failure: send a polite "please type" fallback and exit early.
  if (msg.audioFileId && !combinedMessage.trim()) {
    const transcript = await transcribeVoiceMessage(
      msg.audioFileId,
      msg.provider,
      integration.accessToken,
      label,
      { companyId: integration.companyId, conversationId },
    );
    if (transcript) {
      combinedMessage = transcript;
      // Back-fill the message record so it shows readable text in the admin conversation view.
      if (savedMessageId) {
        await supabase.from('messages').update({ content: transcript }).eq('id', savedMessageId);
      }
      console.info(`${label} Voice transcribed (${transcript.length} chars): "${transcript.slice(0, 80)}"`);
    } else {
      // Transcription failed — let the customer know without crashing the pipeline.
      const isGeoCtx = /[\u10D0-\u10FF]/.test(preloadedHistory.map(m => m.content).join(''));
      const fallback = isGeoCtx
        ? '\u10ee\u10db\u10dd\u10d5\u10d0ნი შეტყობინება მივიღე — გთხოვთ დაწეროთ თქვენი კითხვა ტექსტის სახით.'
        : 'Voice message received — please type your question.';
      await supabase.from('messages').update({ content: '[voice message]' }).eq('id', savedMessageId ?? '');
      await sendProviderResponse(msg.provider, msg.senderId, fallback, integration.accessToken, integration.providerAccountId);
      await releaseLock(conversationId);
      return { conversationId, reply: fallback };
    }
  }

  // 6. Detect intent — fast regex first; AI classifier fallback for ambiguous short messages
  //    (romanized Georgian like "fotoebs", "suratebi", "vnaxo" can't be caught by keywords alone).
  //    When regex returns null (ambiguous), run AI classifier IN PARALLEL with DB queries
  //    so it adds zero wall-clock latency.
  const regexIntent = detectIntent(combinedMessage);
  const needsAIClassify = regexIntent === null;

  // 6a. Process customer-uploaded image (if any) — must happen before Promise.all
  //     so similarity results are available for context loading.
  let imageBase64: string | null = null;
  let imageMimeType: string | null = null;
  let imageSearchQuery: string | null = null;
  let similarApartmentNumbers: string[] = [];
  let similarProductNames: string[] = [];

  if (msg.imageUrl) {
    try {
      const imgRes = await fetch(msg.imageUrl, { signal: AbortSignal.timeout(8000) });
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        imageBase64 = Buffer.from(buf).toString('base64');
        imageMimeType = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
        console.info(`${label} Downloaded customer image (${(buf.byteLength / 1024).toFixed(0)}KB, ${imageMimeType})`);
      }
    } catch (err) {
      console.warn(`${label} Failed to download customer image (non-fatal):`, err);
    }

    imageSearchQuery = imageBase64 && imageMimeType
      ? await describeImageForSearch(
          imageBase64,
          imageMimeType,
          integration.businessType,
          { companyId: integration.companyId, conversationId },
        )
      : null;
    if (imageSearchQuery) {
      console.info(`${label} Image search query: "${imageSearchQuery.slice(0, 80)}"`);
      if (integration.businessType === 'real_estate') {
        similarApartmentNumbers = await searchSimilarApartments(integration.companyId, imageSearchQuery);
        if (similarApartmentNumbers.length > 0) {
          console.info(`${label} Vector search: ${similarApartmentNumbers.length} similar apartments found`);
        }
      } else {
        similarProductNames = await searchSimilarProducts(integration.companyId, imageSearchQuery);
        if (similarProductNames.length > 0) {
          console.info(`${label} Vector search (image): ${similarProductNames.length} similar products found`);
        }
      }
    }
  }

  // 6b. Kick off AI classifier, text-vector product search, and business context in parallel.
  //     For craft_shop text queries, searchSimilarProducts runs alongside the intent classifier
  //     with zero sequential latency — uses the already-deployed pgvector index.
  //     History was pre-loaded at step 3c (before message save) — no DB fetch here.
  const textVectorSearchPromise: Promise<string[]> =
    integration.businessType === 'craft_shop' && combinedMessage.trim() && similarProductNames.length === 0
      ? searchSimilarProducts(integration.companyId, combinedMessage.trim(), 5)
      : Promise.resolve([]);

  const [aiIntent, textVectorNames, businessContext] = await Promise.all([
    needsAIClassify
      ? classifyIntentAI(combinedMessage, { companyId: integration.companyId, conversationId }).then(r => {
          console.info(`${label} AI intent classifier: '${r.intent}'${r.wantsEscalation ? ' [ESCALATE]' : ''} for: "${combinedMessage.slice(0, 60)}"`);
          return r;
        })
      : Promise.resolve(null),

    textVectorSearchPromise,

    // Business context — loaded unconditionally; discarded if intent turns out to be 'chat'
    loadBusinessContext(integration.companyId, integration.businessType, {
      priorityApartmentNumbers: similarApartmentNumbers,
      priorityProductNames: similarProductNames,
      imageSearchQuery: imageSearchQuery ?? undefined,
      textQuery: combinedMessage.trim() || undefined,
    }),
  ]);

  // Merge text-vector results into priority names (after image vector, before token retrieval).
  // Only add names not already surfaced by the image vector search.
  if (textVectorNames.length > 0) {
    const existingSet = new Set(similarProductNames.map(n => n.toLowerCase()));
    const newNames = textVectorNames.filter(n => !existingSet.has(n.toLowerCase()));
    if (newNames.length > 0) {
      console.info(`${label} Vector search (text): ${newNames.length} product(s) found — top: "${newNames[0]}"`);
      // Promote text-vector hits to priority front in businessContext.
      // businessContext was already loaded — re-sort products array in place.
      if ('products' in businessContext && Array.isArray(businessContext.products)) {
        const allProds = businessContext.products as Array<{ name: string }>;
        const vectorSet = new Set([...similarProductNames, ...newNames].map(n => n.toLowerCase()));
        const prioritized = allProds.filter(p => vectorSet.has(p.name.toLowerCase()));
        const rest = allProds.filter(p => !vectorSet.has(p.name.toLowerCase()));
        (businessContext as { products: Array<{ name: string }> }).products = [...prioritized, ...rest];
      }
    }
  }

  const messageIntent = regexIntent ?? (aiIntent?.intent ?? 'search') as import('@/lib/ai/intentDetector').MessageIntent;

  // Use the pre-loaded history snapshot (captured before current message was saved to DB).
  // lastShownApt is passed directly to generateReply to seed conversation state —
  // no synthetic SHOW_PHOTOS injection needed.
  const history: MessageHistoryEntry[] = preloadedHistory;

  // 7b. Photo follow-up detection:
  //     If the last AI message asked "which apartment?" in response to a photo request,
  //     and the current message answers with specs (floor/rooms/size), upgrade to 'photos'.
  //     Without this, the follow-up turn has no photo keywords → intent='search' → AI writes
  //     "I'll show you" but strict SHOW_PHOTOS rule blocks emitting the marker.
  const lastAiMsg = history.filter(m => m.role === 'ai').slice(-1)[0]?.content ?? '';
  const lastAiAskedWhichApt = /ფოტო|სურათ|photo|picture/i.test(lastAiMsg)
    && /რომელ|which|specify|მიმიტ|გთხოვ|floor|სართ|room|ოთახ|budget|ბიუჯ/i.test(lastAiMsg);
  let effectiveIntent: import('@/lib/ai/intentDetector').MessageIntent =
    (messageIntent !== 'photos' && lastAiAskedWhichApt) ? 'photos' : messageIntent;
  if (effectiveIntent !== messageIntent) {
    console.info(`${label} Photo follow-up detected — upgrading intent '${messageIntent}' -> 'photos'`);
  }

  // 7c. Post-photo intent override — CRITICAL:
  //     NEVER use the 'chat' micro-prompt after photos have been shown for buying-signal
  //     reactions like "Mindaa", "viqidi", "👍", "magaria" — these need full state context.
  //     BUT: genuine social closings ("madloba", "goodbye", "ok") should stay as 'chat'
  //     so the AI responds naturally instead of robotically firing the rep-contact line.
  //     Rule: only override 'chat'→'search' when the regex classifier returned null
  //     (ambiguous short message sent to AI classifier) AND photos are active.
  //     When the regex itself returned 'chat', it matched CHAT_ONLY_RE — definitely social.
  if (effectiveIntent === 'chat' && regexIntent === null && (lastShownApt || photosSent)) {
    console.info(`${label} Post-photo ambiguous short message — overriding 'chat' to 'search' (full lead context needed)`);
    effectiveIntent = 'search';
  }

  // 7d. Image-only message override:
  //     Customer sent only an image with no caption → combinedMessage is empty.
  //     detectIntent('') hard-codes 'chat', which stubs out the business context and
  //     discards the vector-search results computed in step 6a. An image is always a
  //     product/search intent — force 'search' so the inventory + image context are used.
  if (msg.imageUrl && !combinedMessage.trim()) {
    effectiveIntent = 'search';
    console.info(`${label} Image-only message (no caption) — overriding intent to 'search'`);
  }

  const isFirstMeaningfulTurn = history.filter(m => m.role === 'user').length === 0;
  const lastAiAskedBusinessQuestion = /\?/.test(lastAiMsg)
    && /(address|hours|price|budget|product|item|style|material|zodiac|stone|photo|visit|buy|apartment|project|room|floor|catalog|shop|store|ფასი|მისამართ|პროდუქტ|ნივთ|მასალ|ზოდიაქ|ქვა|ფოტო|ბინა|პროექტ|ოთახ|სართულ|მაღაზ)/i.test(lastAiMsg);
  const shortContextReply = combinedMessage.trim().length > 0 && combinedMessage.trim().length <= 20;

  if (effectiveIntent === 'chat' && isFirstMeaningfulTurn && BUSINESS_QUERY_RE.test(combinedMessage)) {
    effectiveIntent = 'search';
    console.info(`${label} First-turn business query — overriding 'chat' to 'search'`);
  }

  if (effectiveIntent === 'chat' && lastAiAskedBusinessQuestion && shortContextReply) {
    effectiveIntent = 'search';
    console.info(`${label} Short reply to business question — overriding 'chat' to 'search'`);
  }

  // For pure chat intent, keep a minimal grounded context instead of a fully empty stub.
  // Must be computed AFTER all intent overrides above.
  const finalBusinessContext: BusinessContext = effectiveIntent === 'chat'
    ? (integration.businessType === 'real_estate'
        ? ({ apartments: [], businessDescription: businessContext.businessDescription } as ApartmentContext)
        : ({ products: [], businessDescription: businessContext.businessDescription } as ProductContext))
    : businessContext;
  console.info(
    `${label} [routing] company:${integration.companyId} biz:${integration.businessType} intent:${effectiveIntent} first:${isFirstMessage} regex:${regexIntent ?? 'null'} context:${effectiveIntent === 'chat' ? 'minimal-grounded' : 'full'}`,
  );

  // ── Soft-escalation detection (deterministic, zero AI calls) ─────────────
  // Triggers: (1) explicit human/operator request
  // Flow: offer human help this turn → on next turn check Redis key → if confirmed
  //       skip AI, send contact info, create escalation record + pause AI.
  const ESC_OFFER_KEY = `cubio:esc_offered:${conversationId}`;
  let escalationConfirmed = false;
  let offerEscalation = false;
  try {
    const escOffered = await redis.get(ESC_OFFER_KEY);
    const skipReOffer = !!escOffered; // don't spam the offer if customer already saw it
    if (escOffered) {
      if (ESCALATION_CONFIRM_RE.test(combinedMessage.trim())) escalationConfirmed = true;
      await redis.del(ESC_OFFER_KEY); // clear regardless — offer was either taken or declined
    }
    if (!escalationConfirmed) {
      const humanReq = HUMAN_REQUEST_RE.test(combinedMessage)
        // Also surface escalation intent from the AI classifier for romanized/mixed requests
        || (aiIntent?.wantsEscalation ?? false);
      // We no longer trigger soft-escalation on custom requirements or zero search inventory
      // to keep normal shopping queries inside sales flows and prevent false lockouts.
      offerEscalation = humanReq;
    }
  } catch {
    // Redis unavailable — soft escalation skipped; hard escalation (ANGER_RE) still active
  }

  // Confirmed soft escalation: skip AI, send contact, persist escalation record
  if (escalationConfirmed) {
    const isGeo = /[\u10D0-\u10FF]/.test(combinedMessage)
      || history.some(m => /[\u10D0-\u10FF]/.test(m.content));
    const contactMsg = buildEscalationContactMessage(
      (businessContext as ApartmentContext).businessDescription,
      isGeo,
    );
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      company_id: integration.companyId,
      role: 'ai',
      content: contactMsg,
    });
    await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
    await sendProviderResponse(msg.provider, msg.senderId, contactMsg, integration.accessToken, integration.providerAccountId);
    void persistEscalation(supabase, integration.companyId, conversationId, resolvedName, resolvedNickname, combinedMessage, msg.provider);
    await releaseLock(conversationId);
    console.info(`${label} [escalation] Soft escalation confirmed — contact sent + AI pausing for conversation ${conversationId}`);
    return { conversationId, reply: contactMsg };
  }

  // 8. Generate AI reply — multi-turn structured history, system instruction includes state
  // Pre-reply signal snapshot logged for every turn — shows lead/frustration balance in server logs.
  // Uses lightweight inline patterns (no extra imports needed) since this is diagnostic only.
  {
    const uText = [...history, { role: 'user', content: combinedMessage }]
      .filter(m => m.role === 'user').map(m => m.content).join('\n');
    const hasPhone   = /(?:\+995[\s-]?)?\d{9,12}/.test(uText);
    const hasBuying  = /მინდა|viqidi|minda|want\s+to\s+buy|call\s+me|გთხოვ\s*დამიკავშირ/i.test(uText);
    const quickLead  = (hasPhone ? 3 : 0) + (hasBuying ? 2 : 0);
    const quickFrust = FRUSTRATION_GATE_RE.test(combinedMessage) ? 2 : 0;
    const turnCount  = history.filter(m => m.role === 'user').length + 1;
    console.info(`${label} [signals] lead:${quickLead} frust:${quickFrust} turns:${turnCount} intent:${effectiveIntent}`);
  }

  const reply = await generateReply(
    combinedMessage,
    finalBusinessContext,
    integration.businessType,
    history,
    msg.imageUrl ?? undefined,
    photosSent,
    effectiveIntent,
    imageBase64,
    imageMimeType,
    isFirstMessage,
    lastShownApt,
    offerEscalation,
    { companyId: integration.companyId, conversationId },
  );

  console.info(`${label} AI reply (${reply.length} chars) for conversation ${conversationId}`);

  // Parse SHOW_PHOTOS: identifier from AI reply.
  // The prompt rules are strict — AI only emits SHOW_PHOTOS when customer explicitly asks.
  // We always process a valid SHOW_PHOTOS: ID regardless of our own intent classification,
  // because intent detection can miss romanized Georgian photo requests ("Suratebi" etc).
  // Guard: only process if there is a valid identifier (prevents bare SHOW_PHOTOS with no id).
  // Character class covers: Latin alphanum + underscore + hyphen (apartment IDs like "0101", "project_0101")
  // AND Georgian Unicode range U+10D0–U+10FF (product slugs built from Georgian product names).
  // Hyphen included because Georgian product IDs like "ილანგ-ილანგის_ეთერზეთი" contain it.
  // Character class extended to include \s so multi-word Georgian product names like
  // "მწვანე ტარა" are captured in full — previously truncated at the first space.
  const showPhotosRaw = reply.match(/SHOW_PHOTOS[:\s]+([A-Za-z0-9_\u10D0-\u10FF-][A-Za-z0-9_\u10D0-\u10FF\s-]*)/i);
  const explicitPhotoRequest = effectiveIntent === 'photos' || PHOTO_RE.test(combinedMessage);
  if (showPhotosRaw && !explicitPhotoRequest) {
    console.warn(`${label} Ignoring SHOW_PHOTOS on non-photo turn for message: "${combinedMessage.slice(0, 80)}"`);
  } else if (showPhotosRaw && effectiveIntent !== 'photos') {
    console.info(`${label} SHOW_PHOTOS detected outside photo intent but message contains explicit photo signal — processing`);
  }
  const showPhotosMatch = explicitPhotoRequest ? (showPhotosRaw ?? null) : null;

  // photoType: apartment | project | any — determined by what the customer actually said.
  const photoType = detectPhotoType(combinedMessage);

  const imageUrlsToSend: string[] = showPhotosMatch
    ? resolvePhotoUrls(finalBusinessContext, showPhotosMatch[1].trim(), photoType, label)
    : [];

  // Always strip ALL SHOW_PHOTOS occurrences from text regardless of whether we acted on it.
  // Regex is intentionally broad: catches SHOW_PHOTOS with/without colon, with/without identifier.
  let cleanReply = reply.replace(/\n?SHOW_PHOTOS[^\n]*/gi, '').trim();

  // Strip any role-label prefixes the AI may have mirrored from the history format.
  cleanReply = cleanReply.replace(/^\s*\[(AI|USER|ASSISTANT|CUSTOMER)\]\s*/i, '').trim();
  cleanReply = cleanReply.replace(/^\s*(?:Assistant|AI)\s*:\s*/i, '').trim();
  cleanReply = stripInternalReplyArtifacts(cleanReply);

  // Safety check: if SHOW_PHOTOS still present after strip, something is very wrong — log and abort.
  if (/SHOW_PHOTOS/i.test(cleanReply)) {
    console.error(`${label} SHOW_PHOTOS still present in cleanReply after strip — truncating reply`);
    cleanReply = cleanReply.replace(/SHOW_PHOTOS/gi, '').trim();
  }

  // Fallback: when AI's entire reply was just the SHOW_PHOTOS marker (AI wrote no text),
  // provide a natural default sentence so the customer gets a text message with their photos.
  if (cleanReply.length === 0 && imageUrlsToSend.length > 0) {
    const isGeoFallback = /[\u10D0-\u10FF]/.test(combinedMessage)
      || history.some(m => /[\u10D0-\u10FF]/.test(m.content));
    cleanReply = integration.businessType === 'real_estate'
      ? (isGeoFallback ? 'აი ბინის ფოტოები! 📸' : 'Here are the photos! 📸')
      : (isGeoFallback ? 'გამოგიგზავნე! 📸' : 'Here you go! 📸');
    console.info(`${label} Empty reply after SHOW_PHOTOS strip — using fallback text`);
  }

  // If the model hallucinated a bare SHOW_PHOTOS marker on a non-photo turn, recover with
  // a short grounded text reply instead of sending an empty message or photo fallback.
  if (showPhotosRaw && !showPhotosMatch && cleanReply.length === 0) {
    const isGeoFallback = /[\u10D0-\u10FF]/.test(combinedMessage)
      || history.some(m => /[\u10D0-\u10FF]/.test(m.content));
    cleanReply = integration.businessType === 'craft_shop'
      ? (isGeoFallback
        ? 'მითხარი რა ტიპის ნივთი გაინტერესებს და კატალოგიდან ზუსტ ვარიანტებს შეგირჩევ.'
        : 'Tell me what type of item you want and I will pick exact options from the catalog.')
      : (isGeoFallback
        ? 'მითხარი რა ტიპის ბინა გაინტერესებს და ზუსტ ვარიანტებს შეგირჩევ.'
        : 'Tell me what kind of apartment you want and I will pick exact options for you.');
    console.info(`${label} Replaced invalid SHOW_PHOTOS-only reply with grounded fallback text`);
  }

  // Safety net: strip any raw URLs that leaked into the reply body despite the prompt rules.
  // URLs are STRIPPED ONLY — never forwarded as images. Sending hallucinated URLs would deliver
  // wrong or non-existent photos. All legitimate images come exclusively from resolvePhotoUrls()
  // which reads verified records from the DB.
  const leakedUrls = cleanReply.match(/https?:\/\/\S+/g);
  if (leakedUrls) {
    cleanReply = cleanReply
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    console.warn(`${label} Stripped ${leakedUrls.length} hallucinated URL(s) from AI reply — NOT forwarding as images`);
  }

  // No-photos fallback: AI emitted SHOW_PHOTOS but no images were resolved for that product.
  // Override whatever text AI wrote — never leave the customer without any response.
  if (showPhotosMatch && imageUrlsToSend.length === 0) {
    const isGeo = /[\u10D0-\u10FF]/.test(combinedMessage)
      || history.some(m => /[\u10D0-\u10FF]/.test(m.content));
    const biz = (finalBusinessContext as { businessDescription?: string }).businessDescription ?? null;
    const companyLine = biz ? `\n\n${biz.slice(0, 150)}` : '';
    cleanReply = isGeo
      ? `ამ პროდუქტის ფოტო ამჟამად ხელმიუწვდომელია.${companyLine ? `\n\nმაღაზიაში შეგიძლიათ ნახოთ პირდაპირ:${companyLine}` : ''}`
      : `We don't have photos for this item right now.${companyLine ? `\n\nYou're welcome to visit us:${companyLine}` : ''}`;
    console.info(`${label} No photos resolved for "${showPhotosMatch[1].trim()}" — sending no-photos fallback`);
  }

  if (integration.businessType === 'craft_shop' && cleanReply.length > 0) {
    // Diagnostics — log the final top-3 products that were surfaced to the AI
    if ('products' in finalBusinessContext) {
      const top3names = (finalBusinessContext as ProductContext).products
        .slice(0, 3).map(p => p.name);
      console.info(`${label} [retrieval] query="${combinedMessage.slice(0, 60)}" top3_context=${JSON.stringify(top3names)}`);
    }
    const guardedReply = guardCraftCatalogReply(cleanReply, combinedMessage, finalBusinessContext as ProductContext, history);
    if (guardedReply.replaced) {
      cleanReply = guardedReply.reply;
      console.warn(`${label} Replaced unsupported craft reply with safe fallback (${guardedReply.reason})`);
    }
  }

  // If we offered escalation this turn, persist the flag so next message can confirm it
  if (offerEscalation && cleanReply.length > 0) {
    try { await redis.set(ESC_OFFER_KEY, '1', { ex: 14400 }); } catch { /* ok */ }
    console.info(`${label} [escalation] Offer sent — awaiting customer confirmation`);
  }

  // 9. Save AI reply
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    company_id: integration.companyId,
    role: 'ai',
    content: cleanReply,
  });

  // Update conversation updated_at
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  // 10. Send photo attachments FIRST (before text) — better UX on Messenger/Instagram
  if (imageUrlsToSend.length > 0) {
    console.info(`${label} Sending ${imageUrlsToSend.length} photo(s) before text reply for conversation ${conversationId}`);
    await sendImageUrls(
      msg.provider,
      msg.senderId,
      imageUrlsToSend,
      integration.accessToken,
      integration.providerAccountId,
    );
    // Persist which apartment was shown + mark photos_sent for next turn's state
    await supabase.from('conversations').update({
      photos_sent: true,
      last_shown_apt: showPhotosMatch![1].trim(),
    }).eq('id', conversationId);
  }

  // 10b. Send text reply after images
  await sendProviderResponse(
    msg.provider,
    msg.senderId,
    cleanReply,
    integration.accessToken,
    integration.providerAccountId,
  );

  // Release the Redis lock — next burst from this user can now be processed
  await releaseLock(conversationId);

  // 11. Backend-only lead/escalation analysis — no Gemini call.
  //     Always fires when gate signals OR lifecycle signals (cancel/apt-change) are present.
  const fullHistory = [...history, { role: 'ai', content: cleanReply }];
  const hasLifecycleSignal =
    CANCEL_RE.test(combinedMessage) || BROWSE_AGAIN_RE.test(combinedMessage);
  const gate = shouldRunLeadAnalysis(fullHistory, combinedMessage, integration.businessType, lastShownApt);

  if (gate.lead || gate.escalation || hasLifecycleSignal) {
    console.info(
      `${label} [leadGate] Running — lead:${gate.lead} escalation:${gate.escalation} lifecycle:${hasLifecycleSignal}`,
    );
    // Awaited (not void) — Vercel can terminate the serverless function immediately after
    // the response is returned, killing fire-and-forget Gemini + Supabase work before it
    // completes. The reply is already sent to the user via sendProviderResponse above;
    // the extra time here only delays the webhook 200 OK, which providers accept for 20s+.
    await detectAndPersistLeadOrEscalation(
      supabase,
      fullHistory,
      combinedMessage,
      integration.companyId,
      conversationId,
      integration.businessType,
      resolvedName,
      resolvedNickname,
      msg.provider,
      lastShownApt,
      gate.lead,
      gate.escalation,
    );
  } else {
    console.info(`${label} [leadGate] Skipped — no qualifying signals`);
  }

  return { conversationId, reply };
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOW_PHOTOS backend resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves real image URLs for a SHOW_PHOTOS identifier emitted by the AI.
 *
 * Real estate: identifier = apartment_number (e.g. "0101")
 * Craft shop:  identifier = product name slug (e.g. "silver_ring")
 *
 * photoType controls which photo set to return (apartment vs project vs both).
 * Returns all matched URLs — no cap; let the provider handle pagination.
 */
function resolvePhotoUrls(
  context: BusinessContext,
  identifier: string,
  photoType: PhotoType,
  label = '',
): string[] {
  const aptCtx = context as ApartmentContext;
  const prodCtx = context as ProductContext;

  if (aptCtx.apartments?.length > 0) {
    // AI uses "project_<apt_number>" when the customer asked for project/building photos.
    // Plain "<apt_number>" or "apt_<apt_number>" means apartment-unit photos.
    const isProjectRequest = /^project_/i.test(identifier);
    const resolvedPhotoType: PhotoType = isProjectRequest ? 'project' : photoType;
    // Strip any prefix to get the bare apartment_number used in the DB.
    const norm = identifier.replace(/^(?:project_|apt_?)/i, '');

    const apt = aptCtx.apartments.find(a => a.apartment_number === norm)
             ?? aptCtx.apartments.find(a => a.apartment_number === identifier);
    if (!apt) {
      console.warn(`${label} SHOW_PHOTOS: identifier "${identifier}" (norm: "${norm}") not found in loaded context — sending nothing`);
      return [];
    }
    const photos = extractApartmentPhotos(apt, resolvedPhotoType);
    if (photos.length === 0) {
      console.warn(`${label} SHOW_PHOTOS: apt ${norm} found but has no ${resolvedPhotoType} images in DB`);
    } else {
      console.info(`${label} SHOW_PHOTOS: resolved ${photos.length} ${resolvedPhotoType} image(s) for apt ${norm}`);
    }
    return photos;
  }

  if (prodCtx.products?.length > 0) {
    // Normalise both sides: spaces AND hyphens → underscore so "მწვანე ტარა", "მწვანე_ტარა"
    // and "ილანგ-ილანგი" all resolve to the same key.
    const slug = (name: string) => name.toLowerCase().replace(/[\s-]+/g, '_').slice(0, 40);
    const id = identifier.replace(/^prod_?/i, '').trim().toLowerCase();
    const prod = prodCtx.products.find(p => slug(p.name) === slug(id));
    if (!prod) {
      console.warn(`${label} SHOW_PHOTOS: product "${identifier}" not found in loaded context — sending nothing`);
      return [];
    }
    const isImg = (u: string) => /\.(webp|jpg|jpeg|png)/i.test(u);
    const photos = prod.images?.filter(u => u.startsWith('http') && isImg(u)) ?? [];
    console.info(`${label} SHOW_PHOTOS: resolved ${photos.length} image(s) for product ${prod.name}`);
    return photos;
  }

  return [];
}

function stripInternalReplyArtifacts(text: string): string {
  return text
    .replace(/\[(?:id|ids|has_photos|photo_key|photo_keys?)[^\]]*\]/gi, '')
    .replace(/\bphoto_keys?\s*:\s*[A-Za-z0-9_\-]+\b/gi, '')
    .replace(/^\s*(?:TOP PRODUCTS|SIMILAR GROUPS|PHOTO KEYS|COMPANY INFO|GROUP)\s*:\s*/gim, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function guardCraftCatalogReply(
  reply: string,
  userMessage: string,
  context: ProductContext,
  history: MessageHistoryEntry[],
): { reply: string; replaced: boolean; reason: string | null } {
  if (!reply.trim() || context.products.length === 0) {
    return { reply, replaced: false, reason: null };
  }

  const retrievalHits = retrieveProducts(context.products, userMessage, 0.22);
  const topConfidence = retrievalHits[0]?.confidence ?? 0;
  const budgetRaw = /(\d[\d,\s]*)\s*(?:₾|\$|gel|lari|ლარ)/i.exec(userMessage);
  const customerBudget = budgetRaw ? parseFloat(budgetRaw[1].replace(/[,\s]/g, '')) : null;
  const broadCatalogQuery = CRAFT_BROAD_QUERY_RE.test(userMessage);
  const shouldListSpecificProducts = !!context.imageSearchQuery || customerBudget !== null || retrievalHits.length > 0;
  const shouldUseCatalogOverview = broadCatalogQuery || customerBudget !== null;
  const needsClarifyingQuestion = !shouldListSpecificProducts && !shouldUseCatalogOverview;
  const mentionedAllowedProduct = replyMentionsCatalogProduct(reply, context.products);
  const moneyValidation = validateCraftMoneyMentions(reply, context.products);
  const companyInfo = extractCompactCompanyInfo(context.businessDescription);
  const replyPhones = reply.match(/(?:\+?\d[\d\s\-()]{5,15}\d)/g) ?? [];
  const invalidPhone = replyPhones.some(phone => normalizePhone(phone) !== normalizePhone(companyInfo.phone));
  const suspiciousVagueRecommendation = needsClarifyingQuestion && (
    moneyValidation.mentions.length > 0
    || mentionedAllowedProduct
    || CRAFT_RECOMMENDATION_RE.test(reply)
  );
  const unsupportedPrice = moneyValidation.invalidMentions.length > 0;
  const inventedProductName = replyContainsInventedProductName(reply, context.products);

  if (!invalidPhone && !suspiciousVagueRecommendation && !unsupportedPrice && !inventedProductName) {
    return { reply, replaced: false, reason: null };
  }

  const reason = invalidPhone
    ? 'unsupported_phone'
    : unsupportedPrice
      ? 'unsupported_price'
      : inventedProductName
        ? 'invented_product_name'
        : 'vague_turn_recommendation';

  return {
    reply: buildSafeCraftReply(userMessage, context, retrievalHits, history, reason),
    replaced: true,
    reason,
  };
}

function validateCraftMoneyMentions(
  reply: string,
  products: ProductContext['products'],
): { mentions: Array<{ amount: number; currency: 'GEL' | 'USD'; raw: string }>; invalidMentions: Array<{ amount: number; currency: 'GEL' | 'USD'; raw: string }> } {
  const mentions = extractMoneyMentions(reply);
  const allowedPriceKeys = new Set(
    products.map(product => `${product.currency === 'USD' ? 'USD' : 'GEL'}:${normalizeAmount(product.price)}`),
  );

  return {
    mentions,
    invalidMentions: mentions.filter(mention => !allowedPriceKeys.has(`${mention.currency}:${normalizeAmount(mention.amount)}`)),
  };
}

function extractMoneyMentions(text: string): Array<{ amount: number; currency: 'GEL' | 'USD'; raw: string }> {
  const rawMentions = text.match(/(?:₾|\$)\s*\d[\d\s,.]*|\d[\d\s,.]*\s*(?:₾|ლარი|lari|gel|usd|dollars?|\$)/gi) ?? [];
  const mentions: Array<{ amount: number; currency: 'GEL' | 'USD'; raw: string }> = [];

  for (const raw of rawMentions) {
    const amountMatch = raw.match(/\d[\d\s,.]*/);
    if (!amountMatch) continue;
    const amount = parseFloat(amountMatch[0].replace(/[,\s]/g, ''));
    if (!Number.isFinite(amount)) continue;
    mentions.push({
      amount,
      currency: /\$|usd|dollar/i.test(raw) ? 'USD' : 'GEL',
      raw,
    });
  }

  return mentions;
}

/**
 * Detects when a reply contains a title-case product-name phrase (English/Latin script)
 * that is NOT present in the catalog but shares at least one significant word with it.
 * This catches world-knowledge hallucinations like "Erotic Tarot" when only
 * "Kitten Tarot" exists — without relying on hardcoded product-type keywords.
 * Only fires on Latin-script product names; Georgian-script hallucinations are
 * prevented by the ALLOWED NAMES prompt fence.
 */
function replyContainsInventedProductName(reply: string, products: ProductContext['products']): boolean {
  // Match title-case sequences of 2+ words: "Erotic Tarot", "Dragon Crystal", etc.
  const candidates = reply.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+\b/g) ?? [];
  if (candidates.length === 0) return false;

  const catalogNormalized = products.map(p => normalizeQuery(p.name));
  const catalogWords = new Set(
    catalogNormalized.flatMap(n => n.split(/\s+/).filter(w => w.length >= 4)),
  );

  return candidates.some(candidate => {
    const norm = normalizeQuery(candidate);
    // Allowed: exact match or substring of a catalog name (e.g. abbreviated reference)
    if (catalogNormalized.some(n => n === norm || n.includes(norm) || norm.includes(n))) return false;
    // Suspicious: candidate shares a significant word with catalog vocabulary
    // but is not itself a known catalog product — likely hallucinated
    return norm.split(/\s+/).some(w => w.length >= 4 && catalogWords.has(w));
  });
}

function replyMentionsCatalogProduct(reply: string, products: ProductContext['products']): boolean {
  const normalizedReply = normalizeQuery(reply);
  return products.some(product => {
    const normalizedName = normalizeQuery(product.name);
    return normalizedName.length >= 3 && normalizedReply.includes(normalizedName);
  });
}

function buildSafeCraftReply(
  userMessage: string,
  context: ProductContext,
  retrievalHits: Array<{ name: string; confidence: number }>,
  history: MessageHistoryEntry[],
  reason: string,
): string {
  const isGeorgian = /[\u10D0-\u10FF]/.test(userMessage)
    || history.some(message => /[\u10D0-\u10FF]/.test(message.content));
  const products = context.products;
  const companyInfo = extractCompactCompanyInfo(context.businessDescription);
  const matchedProducts = retrievalHits
    .slice(0, 2)
    .map(hit => products.find(product => product.name === hit.name))
    .filter(Boolean) as ProductContext['products'];
  const categories = takeUniqueProductValues(products.map(product => product.category), 3);
  const materials = takeUniqueProductValues(products.map(product => product.material), 3);
  const prices = products.map(product => product.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  if (reason === 'vague_turn_recommendation') {
    return isGeorgian
      ? 'ზუსტად რომ შეგირჩიო, მითხარი რა ტიპის ნივთს ეძებ — მაგალითად საჩუქარი, მასალა, ზოდიაქო თუ ბიუჯეტი.'
      : 'To choose accurately, tell me what kind of item you want, for example a gift, material, zodiac theme, or budget.';
  }

  if (matchedProducts.length > 0) {
    const productText = isGeorgian
      ? matchedProducts.map(formatCraftProductSnippetGeorgian).join(' ასევე ')
      : matchedProducts.map(formatCraftProductSnippetEnglish).join(' Also, ');
    const invite = buildCraftInvite(companyInfo, isGeorgian);
    return isGeorgian
      ? `${productText}. ${invite}`.trim()
      : `${productText}. ${invite}`.trim();
  }

  const overview = isGeorgian
    ? buildCraftOverviewGeorgian(categories, materials, minPrice, maxPrice)
    : buildCraftOverviewEnglish(categories, materials, minPrice, maxPrice);
  const invite = buildCraftInvite(companyInfo, isGeorgian);
  return [overview, invite].filter(Boolean).join(' ').trim();
}

function formatCraftProductSnippetGeorgian(product: ProductContext['products'][0]): string {
  const parts = [`${product.name} გვაქვს ${formatCraftPrice(product)}-ად`];
  if (product.material) parts.push(`${product.material} მასალაში`);
  else if (product.category) parts.push(product.category);
  return parts.join(', ');
}

function formatCraftProductSnippetEnglish(product: ProductContext['products'][0]): string {
  const parts = [`We currently have ${product.name} for ${formatCraftPrice(product)}`];
  if (product.material) parts.push(`in ${product.material}`);
  else if (product.category) parts.push(product.category);
  return parts.join(', ');
}

function buildCraftOverviewGeorgian(
  categories: string[],
  materials: string[],
  minPrice: number | null,
  maxPrice: number | null,
): string {
  const parts = ['კატალოგში'];
  if (categories.length > 0) parts.push(`გვაქვს ${categories.join(', ')}`);
  if (materials.length > 0) parts.push(`ძირითადად ${materials.join(', ')} მასალებში`);
  if (minPrice !== null && maxPrice !== null) parts.push(`ფასები დაახლოებით ₾${minPrice}–₾${maxPrice}-ის ფარგლებშია`);
  return `${parts.join(' ')}.`;
}

function buildCraftOverviewEnglish(
  categories: string[],
  materials: string[],
  minPrice: number | null,
  maxPrice: number | null,
): string {
  const parts = ['In the catalog'];
  if (categories.length > 0) parts.push(`we currently have ${categories.join(', ')}`);
  if (materials.length > 0) parts.push(`mainly in ${materials.join(', ')} materials`);
  if (minPrice !== null && maxPrice !== null) parts.push(`with prices roughly in the ₾${minPrice}–₾${maxPrice} range`);
  return `${parts.join(' ')}.`;
}

function buildCraftInvite(
  companyInfo: { address: string | null; hours: string | null; phone: string | null },
  isGeorgian: boolean,
): string {
  const facts = [companyInfo.address, companyInfo.hours, companyInfo.phone ? `phone ${companyInfo.phone}` : null].filter(Boolean);
  if (facts.length > 0) {
    return isGeorgian
      ? `დანარჩენი დეტალებისთვის შეგიძლიათ მოგვწეროთ, დაგვირეკოთ ან გვესტუმროთ: ${facts.join(' | ')}.`
      : `For the remaining details, you can message, call, or visit us: ${facts.join(' | ')}.`;
  }

  return isGeorgian
    ? 'დანარჩენი დეტალებისთვის მოგვწერეთ ან გვესტუმრეთ მაღაზიაში.'
    : 'For the remaining details, message us or visit the shop.';
}

function extractCompactCompanyInfo(raw: string | null): { address: string | null; hours: string | null; phone: string | null } {
  if (!raw) return { address: null, hours: null, phone: null };

  const normalized = raw.replace(/\s+/g, ' ').trim();
  return {
    phone: /(?:\+?\d[\d\s\-()]{5,15}\d)/.exec(normalized)?.[0]?.trim() ?? null,
    hours: /(?:მუშაობს|working hours?|open)\s*[^,.\n]{0,80}/i.exec(normalized)?.[0]?.trim() ?? null,
    address: /(?:მისამართი|address)\s*[:,-]?\s*[^,.\n]{3,80}/i.exec(normalized)?.[0]?.trim() ?? null,
  };
}

function normalizePhone(phone: string | null): string {
  return phone ? phone.replace(/\D/g, '') : '';
}

function takeUniqueProductValues(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) break;
  }

  return result;
}

function formatCraftPrice(product: ProductContext['products'][0]): string {
  const symbol = product.currency === 'USD' ? '$' : '₾';
  return `${symbol}${product.price}`;
}

function normalizeAmount(amount: number): string {
  return amount.toFixed(2);
}

function extractApartmentPhotos(
  apt: ApartmentContext['apartments'][0],
  photoType: PhotoType,
): string[] {
  const proj = apt.project as { images?: string[] } | null;
  // Only pass URLs that are real image files — prevents GIFs or other non-image
  // content from leaking through even if accidentally stored in the DB.
  const isImg = (u: string) => /\.(webp|jpg|jpeg|png)/i.test(u);
  const aptImgs  = apt.images?.filter(u => u.startsWith('http') && isImg(u)) ?? [];
  const projImgs = proj?.images?.filter(u => u.startsWith('http') && isImg(u)) ?? [];

  if (photoType === 'apartment') return aptImgs;
  if (photoType === 'project')   return projImgs;
  // 'any' (user said "show me photos" without specifying type):
  // Prefer apartment-unit photos since AI is pointing at a specific apartment.
  // Only fall back to project/building photos if this unit has none.
  return aptImgs.length > 0 ? aptImgs : projImgs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead & escalation detection
// ─────────────────────────────────────────────────────────────────────────────

async function detectAndPersistLeadOrEscalation(
  supabase: ReturnType<typeof createAdminClient>,
  history: Array<{ role: string; content: string }>,
  latestMessage: string,
  companyId: string,
  conversationId: string,
  businessType: 'real_estate' | 'craft_shop',
  senderName: string | null,
  providerNickname: string | null,
  provider: string,
  lastShownAptId: string | null,
  checkLead = true,
  checkEscalation = true,
) {
  try {
    // Deterministic analysis — no Gemini call, pure regex + heuristics.
    // isEscalation here = explicit human/operator request only.
    const analysis = analyzeLeadState(history, latestMessage, businessType, lastShownAptId);

    // AI-based frustration scoring — runs in the fire-and-forget path so no latency impact.
    // The AI scores 1–5; scores >= 4 create an escalation.
    // Gate: only fire the Gemini scorer when deterministic preconditions indicate genuine distress:
    //   • analysis.unresolvedAttempts >= 2 (customer tried multiple times with no result), OR
    //   • explicit frustration language present in the latest message.
    // A single frustration word on a normal browsing turn (e.g. "ძვირია" = it's expensive)
    // does NOT qualify — that just means the price is high, not that the AI failed.
    // IMPORTANT: skip frustration scoring when the customer is already a qualified lead.
    let escalationSignal = analysis.isEscalation;
    const frustrationPreconditionMet = analysis.unresolvedAttempts >= 2 || FRUSTRATION_GATE_RE.test(latestMessage);
    if (checkEscalation && !analysis.isEscalation && !analysis.isLead && frustrationPreconditionMet) {
      // Pass only the last 4 customer messages — frustration is always visible in recent tone.
      // Keeps input tiny (~100–200 tokens max) regardless of conversation length.
      const recentUserMessages = history.filter(m => m.role === 'user').slice(-4);
      const { escalation: aiEsc } = await detectLeadAndEscalation(
        recentUserMessages,
        businessType,
        false,
        true,
        { companyId, conversationId },
      );
      escalationSignal = aiEsc.isEscalation; // true when frustrationLevel >= 4
      if (aiEsc.frustrationLevel >= 2) {
        console.info(`[pipeline] Frustration score ${aiEsc.frustrationLevel}/5 for conversation ${conversationId}${
          aiEsc.isEscalation ? ' → escalating' : ' → below threshold, skipping'
        }`);
      }
    } else if (checkEscalation && !analysis.isEscalation && !analysis.isLead && !frustrationPreconditionMet) {
      console.info(`[pipeline] Frustration gate skipped — unresolvedAttempts:${analysis.unresolvedAttempts} no strong frustration signal for ${conversationId}`);
    }

    // Lead dominance rule: a customer actively in a purchase flow should not be escalated
    // even if minor frustration signals exist. Lead score above frustration score means
    // the customer is engaged and shopping, not hostile.
    if (escalationSignal && !analysis.isEscalation && analysis.leadScore > analysis.frustrationScore + 1) {
      console.info(`[pipeline] Escalation suppressed — lead_score(${analysis.leadScore}) > frustration_score(${analysis.frustrationScore}) for ${conversationId}`);
      escalationSignal = false;
    }

    // ── Fetch existing open lead for lifecycle updates + upsert ──────────────
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id, status, phone, name, meeting_notes')
      .eq('conversation_id', conversationId)
      .neq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── Lead lifecycle updates (always applied to any existing open lead) ────
    if (existingLead && existingLead.status !== 'cancelled') {
      const updates: Record<string, unknown> = {};
      const noteLines: string[] = [];

      // Cancellation — mark status + append timestamped note
      if (analysis.updateType.includes('cancel')) {
        updates.status = 'cancelled';
        if (analysis.cancellationNote) noteLines.push(analysis.cancellationNote);
        console.info(`[pipeline] Lead cancelled for conversation ${conversationId}`);
      }

      // New/changed phone number
      const latestPhoneMatch = PHONE_EXTRACT_RE.exec(latestMessage);
      const latestPhone = latestPhoneMatch ? latestPhoneMatch[1] : null;
      if (latestPhone && latestPhone !== (existingLead.phone as string | null)) {
        updates.phone = latestPhone;
        console.info(`[pipeline] Lead phone updated for conversation ${conversationId}`);
      }

      // Name — fill in if the lead was created without one
      if (analysis.name && !(existingLead.name as string | null)) {
        updates.name = senderName ?? analysis.name;
      }

      // Apartment change request — append a note (does not reset lead status)
      if (analysis.updateType.includes('apt_change')) {
        noteLines.push(
          `[${new Date().toISOString().slice(0, 16)}] Customer requested different apartment: "${latestMessage.slice(0, 120)}"`,
        );
      }

      if (noteLines.length > 0) {
        const existing = (existingLead.meeting_notes as string | null) ?? '';
        updates.meeting_notes = [existing, ...noteLines].filter(Boolean).join('\n---\n');
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('leads').update(updates).eq('id', existingLead.id as string);
      }
    }

    // ── Lead creation / update ────────────────────────────────────────────────
    const isCancelled = (existingLead?.status as string | null) === 'cancelled';
    if (checkLead && analysis.isLead && analysis.summary) {
      if (existingLead && !isCancelled) {
        // Existing open lead — refresh with latest info
        await supabase.from('leads').update({
          name: senderName ?? analysis.name ?? undefined,
          provider_nickname: providerNickname ?? senderName ?? undefined,
          phone: analysis.phone ?? undefined,
          summary: analysis.summary,
          status: 'new',
        }).eq('id', existingLead.id as string);
        console.info(`[pipeline] Lead updated for conversation ${conversationId}`);
      } else if (!existingLead) {
        // No existing lead — create fresh
        await supabase.from('leads').insert({
          company_id: companyId,
          conversation_id: conversationId,
          name: senderName ?? analysis.name,
          provider_nickname: providerNickname ?? senderName,
          phone: analysis.phone,
          summary: analysis.summary,
          status: 'new',
          ai_handled: false,
          provider,
        });
        console.info(`[pipeline] Lead created for conversation ${conversationId}`);
      }
    }

    // ── Escalation ────────────────────────────────────────────────────────────
    if (checkEscalation && escalationSignal) {
      const { data: latestEscalation } = await supabase
        .from('escalations')
        .select('id, status, updated_at')
        .eq('conversation_id', conversationId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestEscalation?.status === 'open') {
        // Already being handled — skip
      } else if (latestEscalation?.status === 'resolved' || latestEscalation?.status === 'ignored') {
        // Only re-open if there are 2+ new user messages since the resolution
        const { count: newMsgCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .eq('role', 'user')
          .gt('created_at', latestEscalation.updated_at as string);

        if ((newMsgCount ?? 0) >= 2) {
          const { error: esc2Err } = await supabase.from('escalations').insert({
            company_id: companyId,
            conversation_id: conversationId,
            contact_name: senderName,
            provider_nickname: providerNickname ?? senderName,
            summary: `Escalation: ${latestMessage.slice(0, 200)}`,
            status: 'open',
            provider,
          });
          if (esc2Err) {
            console.error(`[pipeline] escalations re-open insert failed for ${conversationId}:`, esc2Err.message);
          } else {
            const { error: pauseErr2 } = await supabase.from('conversations').update({ ai_paused: true }).eq('id', conversationId);
            if (pauseErr2) console.error(`[pipeline] ai_paused update failed for ${conversationId}:`, pauseErr2.message);
            console.info(`[pipeline] New escalation (post-resolution) + AI paused for conversation ${conversationId}`);
          }
        } else {
          console.info(`[pipeline] Escalation suppressed — not enough new messages since last resolution (conversation ${conversationId})`);
        }
      } else {
        // No prior escalation — create fresh
        const { error: esc1Err } = await supabase.from('escalations').insert({
          company_id: companyId,
          conversation_id: conversationId,
          contact_name: senderName,
          provider_nickname: providerNickname ?? senderName,
          summary: `Escalation: ${latestMessage.slice(0, 200)}`,
          status: 'open',
          provider,
        });
        if (esc1Err) {
          console.error(`[pipeline] escalations insert failed for ${conversationId}:`, esc1Err.message);
        } else {
          const { error: pauseErr } = await supabase.from('conversations').update({ ai_paused: true }).eq('id', conversationId);
          if (pauseErr) console.error(`[pipeline] ai_paused update failed for ${conversationId}:`, pauseErr.message);
          console.info(`[pipeline] Escalation created + AI paused for conversation ${conversationId}`);
        }
      }
    }
  } catch (err) {
    console.error('[pipeline] detectAndPersistLeadOrEscalation error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Soft escalation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an escalation record and pauses the AI for this conversation.
 * Used when the customer explicitly confirms they want a human representative.
 */
async function persistEscalation(
  supabase: ReturnType<typeof createAdminClient>,
  companyId: string,
  conversationId: string,
  senderName: string | null,
  providerNickname: string | null,
  latestMessage: string,
  provider: string,
) {
  try {
    await supabase.from('escalations').insert({
      company_id: companyId,
      conversation_id: conversationId,
      contact_name: senderName,
      provider_nickname: providerNickname ?? senderName,
      summary: `Customer requested representative: "${latestMessage.slice(0, 200)}"`,
      status: 'open',
      provider,
    });
    await supabase.from('conversations').update({ ai_paused: true }).eq('id', conversationId);
    console.info(`[pipeline] Soft escalation persisted + AI paused for conversation ${conversationId}`);
  } catch (err) {
    console.error('[pipeline] persistEscalation error:', err);
  }
}

/**
 * Composes a natural escalation confirmation message with the company's contact info.
 * Extracts the phone number from businessDescription when available.
 * Scalable: works for real_estate, craft_shop, and any future business type.
 */
function buildEscalationContactMessage(
  businessDescription: string | null | undefined,
  isGeorgian: boolean,
): string {
  // Extract first phone-like pattern from the business description
  const phoneMatch = businessDescription
    ? /(?:\+?\d[\d\s\-()]{5,15}\d)/.exec(businessDescription)
    : null;
  const phone = phoneMatch ? `\n📞 ${phoneMatch[0].trim()}` : '';

  return isGeorgian
    ? `ჩვენი წარმომადგენელი მალე დაგიკავშირდებათ!${phone}`
    : `A representative will be with you shortly!${phone}`;
}

// ── Meta sender name resolution ───────────────────────────────────────────────
// Facebook/Instagram webhooks don't include the sender's display name.
// Attempt 1: direct PSID/IGSID lookup (requires pages_user_profiles — often blocked by Meta privacy)
// Attempt 2: Conversations API participant lookup (only needs pages_messaging — usually available)
export async function resolveMetaSenderName(
  senderId: string,
  provider: 'facebook' | 'instagram',
  accessToken: string,
  pageId?: string,
): Promise<{ name: string | null; nickname: string | null }> {
  // Instagram Login tokens (start with 'IGAA') must use graph.instagram.com.
  // Facebook page tokens and legacy Instagram tokens use graph.facebook.com.
  // This ensures FB is completely unaffected — only IGAA tokens route differently.
  const baseHost = accessToken.startsWith('IGAA')
    ? 'https://graph.instagram.com'
    : 'https://graph.facebook.com';

  const empty = { name: null, nickname: null };

  try {
    // ── Attempt 1: direct user profile lookup ──────────────────────────────
    const fields = provider === 'instagram' ? 'name,username' : 'name,first_name,last_name';
    const url = new URL(`${baseHost}/v22.0/${senderId}`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json() as { name?: string; first_name?: string; last_name?: string; username?: string };
      if (provider === 'instagram') {
        const name = data.name ?? null;
        // Instagram: prefer @username as the provider_nickname (handle), fall back to display name
        const nickname = data.username ? `@${data.username}` : (data.name ?? null);
        if (name || nickname) return { name, nickname };
      } else {
        const name = data.name ?? ([data.first_name, data.last_name].filter(Boolean).join(' ') || null);
        if (name) return { name, nickname: name };
      }
    }

    // ── Attempt 2: Conversations API (pages_messaging permission) ──────────
    // Works even when direct profile lookup is blocked by Meta privacy restrictions.
    // Instagram Login API requires platform=instagram on this endpoint.
    if (pageId) {
      const convUrl = new URL(`${baseHost}/v22.0/${pageId}/conversations`);
      convUrl.searchParams.set('user_id', senderId);
      convUrl.searchParams.set('fields', 'participants');
      convUrl.searchParams.set('access_token', accessToken);
      if (provider === 'instagram') convUrl.searchParams.set('platform', 'instagram');
      const convRes = await fetch(convUrl.toString());
      if (convRes.ok) {
        const convData = await convRes.json() as {
          data?: Array<{ participants?: { data?: Array<{ name?: string; id?: string }> } }>;
        };
        const thread = (convData.data ?? [])[0];
        const participants = thread?.participants?.data ?? [];
        const participant =
          participants.find(p => p.id === senderId) ??
          participants.find(p => p.id !== pageId);
        if (participant?.name) return { name: participant.name, nickname: participant.name };
      } else {
        const errBody = await convRes.text().catch(() => '');
        console.warn(`[resolveMetaSenderName] Conversations API ${convRes.status} for ${provider}/${senderId}: ${errBody}`);
      }
    }

    console.warn(`[resolveMetaSenderName] Could not resolve name for ${provider} sender ${senderId}`);
    return empty;
  } catch (err) {
    console.error(`[resolveMetaSenderName] Fetch failed for sender ${senderId} (${provider}):`, err);
    return empty;
  }
}

// ── Voice message transcription ───────────────────────────────────────────────
// Downloads the audio file and uses Gemini to transcribe it to text.
// Returns the transcript string, or null if download/transcription fails.
// Caller decides how to handle null (polite fallback or silent skip).

const _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');

async function transcribeVoiceMessage(
  audioFileId: string,
  provider: string,
  accessToken: string,
  label: string,
  usageContext?: { companyId: string; conversationId?: string | null },
): Promise<string | null> {
  try {
    // Step 1: resolve a direct download URL (provider-specific)
    let downloadUrl: string | null = null;

    if (provider === 'instagram' || provider === 'facebook') {
      // Meta: audioFileId IS the direct URL already
      downloadUrl = audioFileId;
    } else if (provider === 'whatsapp') {
      // WhatsApp: audioFileId is a media ID — call Graph API to get the URL
      const mediaRes = await fetch(
        `https://graph.facebook.com/v21.0/${audioFileId}`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) },
      );
      if (!mediaRes.ok) {
        console.warn(`${label} [voice] WhatsApp media lookup failed: ${mediaRes.status}`);
        return null;
      }
      const mediaData = await mediaRes.json() as { url?: string };
      downloadUrl = mediaData.url ?? null;
    } else if (provider === 'telegram') {
      // Telegram: audioFileId is a file_id — call getFile to resolve the path, then build URL
      const fileRes = await fetch(
        `https://api.telegram.org/bot${accessToken}/getFile?file_id=${encodeURIComponent(audioFileId)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!fileRes.ok) {
        console.warn(`${label} [voice] Telegram getFile failed: ${fileRes.status}`);
        return null;
      }
      const fileData = await fileRes.json() as { ok: boolean; result?: { file_path?: string } };
      if (fileData.ok && fileData.result?.file_path) {
        downloadUrl = `https://api.telegram.org/file/bot${accessToken}/${fileData.result.file_path}`;
      }
    }

    if (!downloadUrl) {
      console.warn(`${label} [voice] Could not resolve download URL for ${provider} audio`);
      return null;
    }

    // Step 2: download the audio file
    const headers: Record<string, string> = {};
    if (provider === 'whatsapp') {
      // WhatsApp CDN URLs require Authorization header
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const audioRes = await fetch(downloadUrl, { headers, signal: AbortSignal.timeout(15000) });
    if (!audioRes.ok) {
      console.warn(`${label} [voice] Audio download failed: ${audioRes.status}`);
      return null;
    }
    const audioBuffer = await audioRes.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    const mimeType = (audioRes.headers.get('content-type') ?? 'audio/ogg').split(';')[0];
    console.info(`${label} [voice] Downloaded audio (${(audioBuffer.byteLength / 1024).toFixed(0)}KB, ${mimeType})`);

    // Step 3: transcribe with Gemini — compact prompt, output-capped to save tokens
    const visionModel = _genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await visionModel.generateContent({
      contents: [{
        role: 'user',
        parts: [
          { text: 'Transcribe this voice message. Return only the spoken words, nothing else.' },
          { inlineData: { data: audioBase64, mimeType } },
        ],
      }],
      generationConfig: { maxOutputTokens: 300, temperature: 0, thinkingConfig: { thinkingBudget: 0 } } as never,
    });
    await persistAIUsage(
      usageContext ? { ...usageContext, feature: 'voice_transcribe', model: 'gemini-2.5-flash' } : null,
      result.response.usageMetadata,
    );
    const transcript = result.response.text().trim();
    return transcript || null;
  } catch (err) {
    console.warn(`${label} [voice] Transcription error (non-fatal):`, err);
    return null;
  }
}
