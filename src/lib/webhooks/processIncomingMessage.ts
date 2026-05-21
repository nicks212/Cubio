import { createAdminClient } from '@/lib/supabase/server';
import { generateReply, detectLeadAndEscalation } from '@/lib/ai';
import { identifyCompany } from './identifyCompany';
import { loadBusinessContext } from './loadBusinessContext';
import { sendProviderResponse, sendImageUrls } from './sendProviderResponse';
import { bufferAndClaim, isStampHolder, acquireLock, drainBuffer, releaseLock, DEBOUNCE_MS } from './messageBuffer';
import { detectIntent } from '@/lib/ai/intentDetector';
import type { NormalizedMessage, ProcessResult, MessageHistoryEntry } from './types';

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

  // Load business context (apartments or products + business description)
  // Skipped for 'chat' intent (greetings/thanks) to save DB round-trip + ~700 tokens.
  const businessContext = messageIntent === 'chat'
    ? { apartments: [], products: [], businessDescription: null }
    : await loadBusinessContext(
        integration.companyId,
        integration.businessType,
      );

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
  );

  console.info(`${label} AI reply (${reply.length} chars) for conversation ${conversationId}`);

  // Strip PHOTOS: tag from the reply — parse image URLs before saving/sending text.
  // Regex handles PHOTOS: at any line position (start, after newline) with flexible spacing.
  const photosMatch = reply.match(/(?:^|\n)PHOTOS:\s*([^\n]+)/m);
  const imageUrlsToSend: string[] = photosMatch
    ? photosMatch[1].trim().split(/\s+/).filter(u => u.startsWith('http')).slice(0, 5)
    : [];
  let cleanReply = reply.replace(/\nPHOTOS:\s*.+$/m, '').trim();

  // Strip any raw URLs that leaked into the reply body — send them as actual images instead.
  // (AI sometimes copies photo metadata verbatim from context; we never want bare links in text.)
  const leakedUrls = cleanReply.match(/https?:\/\/\S+/g);
  if (leakedUrls) {
    cleanReply = cleanReply.replace(/https?:\/\/\S+/g, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    for (const u of leakedUrls) {
      if (!imageUrlsToSend.includes(u) && imageUrlsToSend.length < 5) imageUrlsToSend.push(u);
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

  // 11. Detect lead / escalation (fire-and-forget — runs after reply is delivered)
  //     Only run every 3rd user message to save API costs (~66% reduction).
  //     Requires at least 4 messages total (2 user + 2 AI) to produce a meaningful signal.
  const fullHistory = [...history, { role: 'ai', content: cleanReply }];
  const userMessageCount = fullHistory.filter(m => m.role === 'user').length;
  if (fullHistory.length >= 4 && userMessageCount % 3 === 0) {
    void detectAndPersistLeadOrEscalation(
      supabase,
      fullHistory,
      integration.companyId,
      conversationId,
      integration.businessType,
      resolvedName,
      msg.provider,
    );
  }

  return { conversationId, reply };
}

async function detectAndPersistLeadOrEscalation(
  supabase: ReturnType<typeof createAdminClient>,
  history: Array<{ role: string; content: string }>,
  companyId: string,
  conversationId: string,
  businessType: 'real_estate' | 'craft_shop',
  senderName: string | null,
  provider: string,
) {
  try {
    // Run combined detection in one Gemini call (saves 1 API round-trip per message)
    const { lead: leadResult, escalation: escalationResult } = await detectLeadAndEscalation(
      history,
      businessType,
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
