import { createAdminClient } from '@/lib/supabase/server';
import { generateReply, detectLeadAndEscalation } from '@/lib/ai';
import { identifyCompany } from './identifyCompany';
import { loadBusinessContext } from './loadBusinessContext';
import { sendProviderResponse, sendImageUrls } from './sendProviderResponse';
import { bufferAndClaim, isStampHolder, acquireLock, drainBuffer, releaseLock, DEBOUNCE_MS } from './messageBuffer';
import { detectIntent, detectPhotoType } from '@/lib/ai/intentDetector';
import { shouldRunLeadAnalysis } from '@/lib/ai/leadGate';
import { describeImageForSearch, searchSimilarApartments, searchSimilarProducts } from '@/lib/ai/embeddings';
import { redis } from '@/lib/redis';
import { createHash } from 'crypto';
import type { NormalizedMessage, ProcessResult, MessageHistoryEntry } from './types';
import type { ApartmentContext, ProductContext, BusinessContext } from '@/lib/ai/types';
import type { PhotoType } from '@/lib/ai/intentDetector';

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
  let resolvedName = msg.senderName;
  if (!resolvedName && (msg.provider === 'facebook' || msg.provider === 'instagram')) {
    resolvedName = await resolveMetaSenderName(
      msg.senderId,
      msg.provider as 'facebook' | 'instagram',
      integration.accessToken,
      integration.providerAccountId, // page ID — used for Conversations API fallback
    );
    if (resolvedName) console.info(`${label} Resolved sender name: ${resolvedName}`);
  }

  // 2. Find or create conversation — read ai_paused for human takeover check
  let conversationId: string;
  let aiPaused = false;
  let photosSent = false;

  const { data: existing } = await supabase
    .from('conversations')
    .select('id, ai_paused, contact_name, photos_sent')
    .eq('company_id', integration.companyId)
    .eq('provider', msg.provider)
    .eq('provider_conversation_id', msg.senderId)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    conversationId = existing.id as string;
    aiPaused = (existing.ai_paused as boolean | null) ?? false;
    photosSent = (existing.photos_sent as boolean | null) ?? false;
    // Back-fill contact_name if we resolved a name but the record was created without one
    if (resolvedName && !(existing.contact_name as string | null)) {
      await supabase.from('conversations').update({ contact_name: resolvedName }).eq('id', conversationId);
      // Cascade to leads and escalations that were created with null contact_name
      await Promise.all([
        supabase.from('leads')
          .update({ name: resolvedName, provider_nickname: resolvedName })
          .eq('conversation_id', conversationId)
          .is('name', null),
        supabase.from('escalations')
          .update({ contact_name: resolvedName, provider_nickname: resolvedName })
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
  const combinedMessage = bufferedTexts.length > 0
    ? bufferedTexts.join('\n')
    : msg.messageText;
  console.info(`${label} [debounce] processing ${bufferedTexts.length} buffered message(s) for conversation ${conversationId}`);

  // 6. Detect intent — skip expensive DB context load for simple chat messages
  const messageIntent = detectIntent(combinedMessage);

  // 6a. Process customer-uploaded image (if any) — multimodal path:
  //     1. Download image for inline Gemini vision (true multimodal)
  //     2. Generate a text description optimized for inventory search
  //     3. Run vector similarity search to surface the most relevant items
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

    // Describe the image as a search query (separate fast Gemini call)
    imageSearchQuery = await describeImageForSearch(msg.imageUrl, integration.businessType);
    if (imageSearchQuery) {
      console.info(`${label} Image search query: "${imageSearchQuery.slice(0, 80)}"`);
      // Run vector similarity search (falls back silently if pgvector not deployed)
      if (integration.businessType === 'real_estate') {
        similarApartmentNumbers = await searchSimilarApartments(integration.companyId, imageSearchQuery);
        if (similarApartmentNumbers.length > 0) {
          console.info(`${label} Vector search: ${similarApartmentNumbers.length} similar apartments found`);
        }
      } else {
        similarProductNames = await searchSimilarProducts(integration.companyId, imageSearchQuery);
        if (similarProductNames.length > 0) {
          console.info(`${label} Vector search: ${similarProductNames.length} similar products found`);
        }
      }
    }
  }

  // Load business context — skipped for pure chat intents to save DB round-trip + tokens.
  // Pass similarity results so the context loader can surface the most relevant items first.
  const businessContext: BusinessContext = messageIntent === 'chat'
    ? { apartments: [], products: [], businessDescription: null } as ApartmentContext
    : await loadBusinessContext(integration.companyId, integration.businessType, {
        priorityApartmentNumbers: similarApartmentNumbers,
        priorityProductNames: similarProductNames,
        imageSearchQuery: imageSearchQuery ?? undefined,
      });

  // 7. Load recent message history (last 6 messages; generate.ts slices to 4 internally)
  const { data: historyRows } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(6);

  const history: MessageHistoryEntry[] = ((historyRows ?? []) as MessageHistoryEntry[]).reverse();

  // 8. Generate AI reply — Layer 1 (global) + Layer 2 (business-type) combined
  const reply = await generateReply(
    combinedMessage,
    businessContext,
    integration.businessType,
    history,
    msg.imageUrl ?? undefined,
    photosSent,
    messageIntent,
    imageBase64,
    imageMimeType,
  );

  console.info(`${label} AI reply (${reply.length} chars) for conversation ${conversationId}`);

  // Parse SHOW_PHOTOS: marker — backend resolves real image URLs from loaded context.
  // AI only emits a compact identifier (apartment number or product slug); never raw URLs.
  // Backend then fetches and sends actual attachments, keeping Gemini prompts URL-free.
  const showPhotosMatch = reply.match(/(?:^|\n)SHOW_PHOTOS:\s*(\S+)/m);
  const photoType = detectPhotoType(combinedMessage); // apartment | project | any
  const imageUrlsToSend: string[] = showPhotosMatch
    ? resolvePhotoUrls(businessContext, showPhotosMatch[1].trim(), photoType)
    : [];

  let cleanReply = reply.replace(/(?:^|\n)SHOW_PHOTOS:\s*\S+/m, '').trim();

  // Safety net: strip any raw URLs that leaked into the reply body despite the prompt rules.
  // Leaked URLs are captured and sent as actual image attachments instead.
  const leakedUrls = cleanReply.match(/https?:\/\/\S+/g);
  if (leakedUrls) {
    cleanReply = cleanReply
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    for (const u of leakedUrls) {
      if (!imageUrlsToSend.includes(u)) imageUrlsToSend.push(u);
    }
    console.info(`${label} Stripped ${leakedUrls.length} leaked URL(s) from reply text`);
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
    // Mark photos as sent so AI won't auto-send again unless explicitly re-requested
    if (!photosSent) {
      await supabase.from('conversations').update({ photos_sent: true }).eq('id', conversationId);
    }
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

  // 11. Deterministic gate decides whether to invoke Gemini lead/escalation analysis.
  //     Skips Gemini entirely for greetings, browsing, photo requests, short replies,
  //     and conversations without buying signals. Only fires when meaningful signals exist.
  const fullHistory = [...history, { role: 'ai', content: cleanReply }];
  const gate = shouldRunLeadAnalysis(fullHistory, combinedMessage, integration.businessType);

  if (gate.lead || gate.escalation) {
    console.info(`${label} [leadGate] Running analysis — lead:${gate.lead} escalation:${gate.escalation}`);
    void detectAndPersistLeadOrEscalation(
      supabase,
      fullHistory,
      integration.companyId,
      conversationId,
      integration.businessType,
      resolvedName,
      msg.provider,
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
): string[] {
  const aptCtx = context as ApartmentContext;
  const prodCtx = context as ProductContext;

  if (aptCtx.apartments?.length > 0) {
    const apt = aptCtx.apartments.find(a => a.apartment_number === identifier);
    if (!apt) {
      // Partial match fallback — AI sometimes adds "apt_" prefix
      const stripped = identifier.replace(/^apt_?/i, '');
      const fallback = aptCtx.apartments.find(a => a.apartment_number === stripped);
      if (!fallback) return [];
      return extractApartmentPhotos(fallback, photoType);
    }
    return extractApartmentPhotos(apt, photoType);
  }

  if (prodCtx.products?.length > 0) {
    const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '_').slice(0, 40);
    const id = identifier.replace(/^prod_?/i, '').toLowerCase();
    const prod = prodCtx.products.find(p =>
      slug(p.name) === id || p.name.toLowerCase() === id.replace(/_/g, ' ')
    );
    if (!prod) return [];
    return prod.images?.filter(u => u.startsWith('http')) ?? [];
  }

  return [];
}

function extractApartmentPhotos(
  apt: ApartmentContext['apartments'][0],
  photoType: PhotoType,
): string[] {
  const proj = apt.project as { images?: string[] } | null;
  const aptImgs  = apt.images?.filter(u => u.startsWith('http')) ?? [];
  const projImgs = proj?.images?.filter(u => u.startsWith('http')) ?? [];

  if (photoType === 'apartment') return aptImgs;
  if (photoType === 'project')   return projImgs;
  return [...new Set([...aptImgs, ...projImgs])];  // 'any' = both, deduped
}

// ─────────────────────────────────────────────────────────────────────────────
// Lead & escalation detection
// ─────────────────────────────────────────────────────────────────────────────

async function detectAndPersistLeadOrEscalation(
  supabase: ReturnType<typeof createAdminClient>,
  history: Array<{ role: string; content: string }>,
  companyId: string,
  conversationId: string,
  businessType: 'real_estate' | 'craft_shop',
  senderName: string | null,
  provider: string,
  checkLead = true,
  checkEscalation = true,
) {
  try {
    // Run combined detection in one Gemini call (saves 1 API round-trip per message)
    const { lead: leadResult, escalation: escalationResult } = await detectLeadAndEscalation(
      history,
      businessType,
      checkLead,
      checkEscalation,
    );

    // Persist lead — update if an open lead exists (regenerate summary), create new if none/closed
    if (leadResult.isLead && leadResult.summary) {
      const { data: latestLead } = await supabase
        .from('leads')
        .select('id, status')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestLead && latestLead.status !== 'closed') {
        // Existing open/active lead — regenerate with latest info
        await supabase.from('leads').update({
          name: senderName ?? undefined,
          provider_nickname: senderName ?? undefined,
          phone: leadResult.phone ?? undefined,
          email: leadResult.email ?? undefined,
          summary: leadResult.summary,
          meeting_date: leadResult.meetingDate ?? undefined,
          meeting_notes: leadResult.meetingNotes ?? undefined,
          status: 'new',
        }).eq('id', latestLead.id as string);
        console.info(`[pipeline] Lead regenerated for conversation ${conversationId}`);
      } else {
        // No lead, or lead was closed — create fresh ticket
        await supabase.from('leads').insert({
          company_id: companyId,
          conversation_id: conversationId,
          name: senderName,
          provider_nickname: senderName,
          phone: leadResult.phone,
          email: leadResult.email,
          summary: leadResult.summary,
          meeting_date: leadResult.meetingDate,
          meeting_notes: leadResult.meetingNotes,
          status: 'new',
          ai_handled: true,
          provider,
        });
        console.info(`[pipeline] Lead created for conversation ${conversationId}`);
      }
    }

    // Persist escalation — but only based on messages sent AFTER the last resolved/ignored escalation.
    // This prevents old frustration from re-triggering new tickets after a resolved case.
    if (escalationResult.isEscalation && escalationResult.summary) {
      // Find the most recent escalation for this conversation (any status)
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
        // Prior escalation was resolved/ignored — only open a new one if there are 2+ NEW
        // user messages AFTER that resolution (proving fresh frustration, not replay of old history)
        const { count: newMsgCount } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', conversationId)
          .eq('role', 'user')
          .gt('created_at', latestEscalation.updated_at as string);

        if ((newMsgCount ?? 0) >= 2) {
          await supabase.from('escalations').insert({
            company_id: companyId,
            conversation_id: conversationId,
            contact_name: senderName,
            provider_nickname: senderName,
            summary: escalationResult.summary,
            status: 'open',
            provider,
          });
          await supabase.from('conversations').update({ ai_paused: true }).eq('id', conversationId);
          console.info(`[pipeline] New escalation (post-resolution) + AI paused for conversation ${conversationId}`);
        } else {
          console.info(`[pipeline] Escalation detection suppressed — not enough new messages since last resolution (conversation ${conversationId})`);
        }
      } else {
        // No prior escalation — create fresh one
        await supabase.from('escalations').insert({
          company_id: companyId,
          conversation_id: conversationId,
          contact_name: senderName,
          provider_nickname: senderName,
          summary: escalationResult.summary,
          status: 'open',
          provider,
        });
        await supabase.from('conversations').update({ ai_paused: true }).eq('id', conversationId);
        console.info(`[pipeline] Escalation created + AI paused for conversation ${conversationId}`);
      }
    }
  } catch (err) {
    console.error('[pipeline] detectAndPersistLeadOrEscalation error:', err);
  }
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
): Promise<string | null> {
  try {
    // ── Attempt 1: direct user profile lookup ──────────────────────────────
    const fields = provider === 'instagram' ? 'name,username' : 'name,first_name,last_name';
    const url = new URL(`https://graph.facebook.com/v22.0/${senderId}`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url.toString());
    if (res.ok) {
      const data = await res.json() as { name?: string; first_name?: string; last_name?: string; username?: string };
      const resolved = provider === 'instagram'
        ? (data.name ?? (data.username ? `@${data.username}` : null) ?? null)
        : (data.name ?? ([data.first_name, data.last_name].filter(Boolean).join(' ') || null));
      if (resolved) return resolved;
    }

    // ── Attempt 2: Conversations API (pages_messaging permission) ──────────
    // Works even when direct profile lookup is blocked by Meta privacy restrictions.
    if (pageId) {
      const convUrl = new URL(`https://graph.facebook.com/v22.0/${pageId}/conversations`);
      convUrl.searchParams.set('user_id', senderId);
      convUrl.searchParams.set('fields', 'participants');
      convUrl.searchParams.set('access_token', accessToken);
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
        if (participant?.name) return participant.name;
      } else {
        const errBody = await convRes.text().catch(() => '');
        console.warn(`[resolveMetaSenderName] Conversations API ${convRes.status} for ${provider}/${senderId}: ${errBody}`);
      }
    }

    console.warn(`[resolveMetaSenderName] Could not resolve name for ${provider} sender ${senderId}`);
    return null;
  } catch (err) {
    console.error(`[resolveMetaSenderName] Fetch failed for sender ${senderId} (${provider}):`, err);
    return null;
  }
}
