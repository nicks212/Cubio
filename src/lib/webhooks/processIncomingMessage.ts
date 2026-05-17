import { createAdminClient } from '@/lib/supabase/server';
import { generateReply, detectLead, detectEscalation } from '@/lib/ai';
import { identifyCompany } from './identifyCompany';
import { loadBusinessContext } from './loadBusinessContext';
import { sendProviderResponse } from './sendProviderResponse';
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

  // 2. Find or create conversation — read ai_paused for human takeover check
  let conversationId: string;
  let aiPaused = false;

  const { data: existing } = await supabase
    .from('conversations')
    .select('id, ai_paused')
    .eq('company_id', integration.companyId)
    .eq('provider', msg.provider)
    .eq('provider_conversation_id', msg.senderId)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    conversationId = existing.id as string;
    aiPaused = (existing.ai_paused as boolean | null) ?? false;
  } else {
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({
        company_id: integration.companyId,
        integration_id: integration.integrationId,
        provider: msg.provider,
        provider_conversation_id: msg.senderId,
        contact_name: msg.senderName,
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

  // 3. Save incoming message — capture ID for debounce check
  const { data: savedMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      company_id: integration.companyId,
      role: 'user',
      content: msg.messageText,
    })
    .select('id')
    .single();

  const savedMessageId = (savedMsg?.id as string | undefined) ?? null;

  // 4. Human takeover — message stored, AI skips response
  if (aiPaused) {
    console.info(`${label} Conversation ${conversationId} is paused (human takeover) — message saved, AI skipped`);
    return { conversationId, reply: null };
  }

  // 5. Typing debounce — wait briefly so the user can finish a multi-message burst.
  //    After waiting, if a newer user message arrived in this conversation, skip
  //    responding here — the newer message's handler will respond with full context.
  await new Promise<void>(r => setTimeout(r, 800));

  if (savedMessageId) {
    const { data: newerMsg } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .neq('id', savedMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (newerMsg) {
      console.info(`${label} Newer message detected — skipping debounced reply (conversation ${conversationId})`);
      return { conversationId, reply: null };
    }
  }

  // 6. Load business context (apartments or products + business description)
  const businessContext = await loadBusinessContext(
    integration.companyId,
    integration.businessType,
  );

  // 7. Load recent message history (last 10 turns)
  const { data: historyRows } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10);

  const history: MessageHistoryEntry[] = ((historyRows ?? []) as MessageHistoryEntry[]).reverse();

  // 8. Generate AI reply — Layer 1 (global) + Layer 2 (business-type) combined
  const reply = await generateReply(
    msg.messageText,
    businessContext,
    integration.businessType,
    history,
    msg.imageUrl ?? undefined,
  );

  console.info(`${label} AI reply (${reply.length} chars) for conversation ${conversationId}`);

  // 9. Save AI reply
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    company_id: integration.companyId,
    role: 'ai',
    content: reply,
  });

  // 10. Send reply back via provider
  await sendProviderResponse(
    msg.provider,
    msg.senderId,
    reply,
    integration.accessToken,
    integration.providerAccountId,
  );

  // 11. Detect lead / escalation (fire-and-forget — runs after reply is delivered)
  //     Requires at least 3 messages to produce a meaningful signal.
  const fullHistory = [...history, { role: 'ai', content: reply }];
  if (fullHistory.length >= 3) {
    void detectAndPersistLeadOrEscalation(
      supabase,
      fullHistory,
      integration.companyId,
      conversationId,
      integration.businessType,
      msg.senderName,
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
) {
  try {
    // Run both detections in parallel to minimise latency
    const [leadResult, escalationResult] = await Promise.all([
      detectLead(history, businessType),
      detectEscalation(history),
    ]);

    // Persist lead if detected and not already recorded for this conversation
    if (leadResult.isLead && leadResult.summary) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (!existingLead) {
        await supabase.from('leads').insert({
          company_id: companyId,
          conversation_id: conversationId,
          name: senderName,
          provider_nickname: senderName,
          summary: leadResult.summary,
          meeting_date: leadResult.meetingDate,
          meeting_notes: leadResult.meetingNotes,
          status: 'new',
          ai_handled: true,
        });
        console.info(`[pipeline] Lead created for conversation ${conversationId}`);
      }
    }

    // Persist escalation if none is already open for this conversation,
    // then auto-pause AI so the human team takes over immediately.
    if (escalationResult.isEscalation && escalationResult.summary) {
      const { data: existingEscalation } = await supabase
        .from('escalations')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('status', 'open')
        .maybeSingle();

      if (!existingEscalation) {
        await supabase.from('escalations').insert({
          company_id: companyId,
          conversation_id: conversationId,
          contact_name: senderName,
          provider_nickname: senderName,
          summary: escalationResult.summary,
          status: 'open',
        });

        // Pause AI — human takeover begins immediately for all future messages
        await supabase
          .from('conversations')
          .update({ ai_paused: true })
          .eq('id', conversationId);

        console.info(`[pipeline] Escalation created + AI paused for conversation ${conversationId}`);
      }
    }
  } catch (err) {
    console.error('[pipeline] detectAndPersistLeadOrEscalation error:', err);
  }
}
