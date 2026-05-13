import { createAdminClient } from '@/lib/supabase/server';
import type { NormalizedMessage } from '../types';

// ── Telegram Payload Types ───────────────────────────────────────────────────

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
}

interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramWebhookPayload {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Parses a Telegram webhook update.
 *
 * For Telegram, the providerAccountId is the bot's token-derived username stored
 * in the integrations table as provider_account_id.
 *
 * Because the incoming Telegram update doesn't tell us WHICH bot received it,
 * we must match via the webhook URL path — each bot should register its webhook
 * at a unique URL containing the bot token. We look up all active Telegram
 * integrations and match by token.
 */
export async function adaptTelegramPayload(
  payload: TelegramWebhookPayload,
  /** Bot token extracted from the webhook URL path (if using token-in-path pattern) */
  botToken?: string,
): Promise<NormalizedMessage | null> {
  const msg = payload.message ?? payload.edited_message;
  if (!msg?.text || !msg.chat?.id) return null;

  // Resolve providerAccountId: prefer explicit botToken, else look up from DB
  let providerAccountId: string;

  if (botToken) {
    // Bot token was embedded in webhook URL — use it to find the integration
    providerAccountId = await resolveTelegramAccountId(botToken);
  } else {
    // Fall back: look up first active Telegram integration
    providerAccountId = await resolveFirstTelegramAccountId();
  }

  if (!providerAccountId) return null;

  const senderName = [msg.from?.first_name, msg.from?.last_name]
    .filter(Boolean)
    .join(' ') || msg.from?.username || null;

  return {
    provider: 'telegram',
    providerAccountId,
    senderId: String(msg.chat.id),
    senderName,
    messageText: msg.text,
    rawPayload: payload as unknown as Record<string, unknown>,
  };
}

async function resolveTelegramAccountId(botToken: string): Promise<string> {
  // provider_account_id stores the bot's username or ID from /getMe
  // For lookup we match by access_token (bot token)
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('integrations')
    .select('provider_account_id')
    .eq('provider', 'telegram')
    .eq('access_token', botToken)
    .eq('is_active', true)
    .single();

  return (data?.provider_account_id as string) ?? '';
}

async function resolveFirstTelegramAccountId(): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('integrations')
    .select('provider_account_id')
    .eq('provider', 'telegram')
    .eq('is_active', true)
    .limit(1)
    .single();

  return (data?.provider_account_id as string) ?? '';
}

/**
 * Registers a Telegram bot webhook URL via the Bot API.
 */
export async function registerTelegramWebhook(
  botToken: string,
  webhookUrl: string,
): Promise<boolean> {
  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    },
  );
  const json = await res.json() as { ok: boolean; description?: string };
  if (!json.ok) {
    console.error('[registerTelegramWebhook] Failed:', json.description);
  }
  return json.ok;
}
