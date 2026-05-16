import { createAdminClient } from '@/lib/supabase/server';
import { generateReply, detectLead, detectEscalation } from '@/lib/ai';
import { identifyCompany } from './identifyCompany';
import { loadBusinessContext } from './loadBusinessContext';
import { sendProviderResponse } from './sendProviderResponse';
import type { NormalizedMessage, ProcessResult, MessageHistoryEntry } from './types';

/**
 * Core processing pipeline — shared across all providers.
 *
 * 1. Identify company via integration lookup
 * 2. Find or create conversation
 * 3. Save incoming user message
 * 4. Load business context for AI
 * 5. Load recent message history
 * 6. Call Gemini AI
 * 7. Save AI reply
 * 8. Send reply back via provider API
 * 9. Asynchronously check for lead / escalation and persist if detected
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

  // 2. Find or create conversation
  let conversationId: string;

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('company_id', integration.companyId)
    .eq('provider', msg.provider)
    .eq('provider_conversation_id', msg.senderId)
    .eq('status', 'open')
    .maybeSingle();

  if (existing) {
    conversationId = existing.id as string;
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

  // 3. Save incoming message
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    company_id: integration.companyId,
    role: 'user',
    content: msg.messageText,
  });

  // 4. Load business context
  const businessContext = await loadBusinessContext(
    integration.companyId,
    integration.businessType,
  );

  // 5. Load recent message history (last 10 turns)
  const { data: historyRows } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(10);

  const history: MessageHistoryEntry[] = ((historyRows ?? []) as MessageHistoryEntry[]).reverse();

  // 6. Generate AI reply
  const reply = await generateReply(
    msg.messageText,
    businessContext,
    integration.businessType,
    history,
  );

  console.info(`${label} AI reply (${reply.length} chars) for conversation ${conversationId}`);

  // 7. Save AI reply
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    company_id: integration.companyId,
    role: 'ai',
    content: reply,
  });

  // 8. Send reply back via provider
  await sendProviderResponse(
    msg.provider,
    msg.senderId,
    reply,
    integration.accessToken,
    integration.providerAccountId,
  );

  // 9. Detect lead / escalation (fire-and-forget after reply is sent)
  const fullHistory = [...history, { role: 'ai', content: reply }];
  void detectAndPersistLeadOrEscalation(
    supabase,
    fullHistory,
    integration.companyId,
    conversationId,
    integration.businessType,
    msg.senderName,
  );

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
    // Run both detections in parallel
    const [leadResult, escalationResult] = await Promise.all([
      detectLead(history, businessType),
      detectEscalation(history),
    ]);

    // Persist lead if detected and not already recorded for this conversation
    if (leadResult.isLead && leadResult.summary) {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();

      if (!existing) {
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

    // Persist escalation if detected and not already open for this conversation
    if (escalationResult.isEscalation && escalationResult.summary) {
      const { data: existing } = await supabase
        .from('escalations')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('status', 'open')
        .maybeSingle();

      if (!existing) {
        await supabase.from('escalations').insert({
          company_id: companyId,
          conversation_id: conversationId,
          contact_name: senderName,
          provider_nickname: senderName,
          summary: escalationResult.summary,
          status: 'open',
        });
        console.info(`[pipeline] Escalation created for conversation ${conversationId}`);
      }
    }
  } catch (err) {
    console.error('[pipeline] detectAndPersistLeadOrEscalation error:', err);
  }
}
