import { createAdminClient } from '@/lib/supabase/server';

export type AIUsageFeature =
  | 'reply_chat'
  | 'reply_main'
  | 'intent_classifier'
  | 'lead_detect'
  | 'escalation_detect'
  | 'image_describe'
  | 'voice_transcribe'
  | 'escalation_handoff';

export interface AIUsageContext {
  companyId: string;
  conversationId?: string | null;
  feature: AIUsageFeature;
  model: string;
}

type UsageMetadataLike = {
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
  totalTokenCount?: number | null;
};

export async function persistAIUsage(
  context: AIUsageContext | null | undefined,
  usage: UsageMetadataLike | null | undefined,
): Promise<void> {
  if (!context?.companyId || !usage) return;

  const inputTokens = usage.promptTokenCount ?? null;
  const outputTokens = usage.candidatesTokenCount ?? null;
  const totalTokens = usage.totalTokenCount ?? null;
  if (inputTokens === null && outputTokens === null && totalTokens === null) return;

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('ai_usage_events').insert({
      company_id: context.companyId,
      conversation_id: context.conversationId ?? null,
      feature: context.feature,
      model: context.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    });
    if (error) console.warn('[ai/usage] persist failed (non-fatal):', error.message);
  } catch (err) {
    console.warn('[ai/usage] persist error (non-fatal):', err);
  }
}