import { createHmac } from 'crypto';
import type { NormalizedMessage } from '../types';

// ── Viber Webhook Payload Types ──────────────────────────────────────────────

interface ViberSender {
  id: string;
  name: string;
  avatar?: string;
  country?: string;
  language?: string;
  api_version?: number;
}

interface ViberMessage {
  type: 'text' | 'picture' | 'video' | 'file' | 'location' | 'contact' | 'sticker' | 'rich_media';
  text?: string;
  media?: string;
  tracking_data?: string;
}

export interface ViberWebhookPayload {
  event: 'message' | 'delivered' | 'seen' | 'failed' | 'subscribed' | 'unsubscribed' | 'conversation_started';
  timestamp: number;
  message_token?: number;
  sender?: ViberSender;
  message?: ViberMessage;
  /** Viber bot URI — used as providerAccountId to identify integration */
  bot_id?: string;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Parses a Viber webhook payload.
 *
 * Only `message` events with text content are processed.
 * The `bot_id` (Viber public account URI) is used as providerAccountId.
 */
export function adaptViberPayload(
  payload: ViberWebhookPayload,
  /** The Viber bot ID / public account URI (from env or DB), used as providerAccountId */
  botId: string,
): NormalizedMessage | null {
  if (payload.event !== 'message') return null;
  if (!payload.sender?.id || !payload.message?.text) return null;

  return {
    provider: 'viber',
    providerAccountId: botId,
    senderId: payload.sender.id,
    senderName: payload.sender.name || null,
    messageText: payload.message.text,
    rawPayload: payload as unknown as Record<string, unknown>,
  };
}

/**
 * Validates Viber webhook signature.
 * Viber signs each request with HMAC-SHA256 using the auth token.
 *
 * @param body - Raw request body string
 * @param signature - X-Viber-Content-Signature header value
 * @param authToken - Viber bot auth token
 */
export function verifyViberSignature(
  body: string,
  signature: string,
  authToken: string,
): boolean {
  const expected = createHmac('sha256', authToken).update(body).digest('hex');
  return expected === signature;
}
