import type { NormalizedMessage } from '../types';

// ── Meta Payload Types ───────────────────────────────────────────────────────

interface MetaMessage {
  mid?: string;
  text?: string;
  attachments?: Array<{ type: string; payload: { url?: string } }>;
}

interface MetaMessagingEvent {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: MetaMessage;
  postback?: { title: string; payload: string };
}

interface MetaEntry {
  id: string;
  time?: number;
  messaging?: MetaMessagingEvent[];
  changes?: Array<{ field: string; value: unknown }>;
}

export interface MetaWebhookPayload {
  object: 'page' | 'instagram' | string;
  entry: MetaEntry[];
}

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Parses a Meta webhook payload (Facebook Messenger or Instagram)
 * and returns an array of normalized messages.
 *
 * Each entry can have multiple messaging events.
 */
export function adaptMetaPayload(
  payload: MetaWebhookPayload,
): NormalizedMessage[] {
  const provider = payload.object === 'instagram' ? 'instagram' : 'facebook';
  const messages: NormalizedMessage[] = [];

  for (const entry of payload.entry ?? []) {
    const events = entry.messaging ?? [];

    for (const event of events) {
      // Handle text messages and voice/audio attachments
      const hasText = !!event.message?.text;
      const audioAttachment = event.message?.attachments?.find(a => a.type === 'audio');
      const audioUrl = audioAttachment?.payload?.url ?? null;
      if (!hasText && !audioUrl) continue;

      const senderId = event.sender?.id;
      const recipientId = event.recipient?.id;

      if (!senderId || !recipientId) continue;

      messages.push({
        provider,
        providerAccountId: recipientId,
        senderId,
        senderName: null,
        messageText: event.message?.text ?? '',
        audioFileId: audioUrl,
        messageId: event.message?.mid ?? null,
        rawPayload: event as Record<string, unknown>,
      });
    }
  }

  return messages;
}

/**
 * Validates the Meta webhook verification request.
 */
export function verifyMetaWebhook(
  mode: string | null,
  token: string | null,
  challenge: string | null,
  verifyToken: string,
): string | null {
  if (mode === 'subscribe' && token === verifyToken) {
    return challenge;
  }
  return null;
}
