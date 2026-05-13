import type { NormalizedMessage } from '../types';

// ── WhatsApp Business API Payload Types ──────────────────────────────────────

interface WAContactProfile {
  name: string;
  wa_id: string;
}

interface WATextMessage {
  body: string;
}

interface WAMessage {
  id: string;
  from: string; // sender phone number
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contacts' | 'interactive' | 'sticker';
  text?: WATextMessage;
}

interface WAValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WAContactProfile[];
  messages?: WAMessage[];
  statuses?: Array<{ id: string; status: string; timestamp: string; recipient_id: string }>;
}

interface WAChange {
  field: 'messages';
  value: WAValue;
}

interface WAEntry {
  id: string;
  changes: WAChange[];
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WAEntry[];
}

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Parses a WhatsApp Business API webhook payload.
 *
 * The providerAccountId used to look up integrations is the phone_number_id
 * from the webhook metadata, which is stored as provider_account_id in DB.
 */
export function adaptWhatsAppPayload(
  payload: WhatsAppWebhookPayload,
): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages') continue;

      const { metadata, messages: incomingMessages = [], contacts = [] } = change.value;
      const phoneNumberId = metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Build a sender name map from contacts
      const nameMap = new Map<string, string>();
      for (const contact of contacts) {
        nameMap.set(contact.wa_id, contact.name);
      }

      for (const msg of incomingMessages) {
        // Only process text messages
        if (msg.type !== 'text' || !msg.text?.body) continue;

        messages.push({
          provider: 'whatsapp',
          providerAccountId: phoneNumberId,
          senderId: msg.from,
          senderName: nameMap.get(msg.from) ?? null,
          messageText: msg.text.body,
          rawPayload: msg as unknown as Record<string, unknown>,
        });
      }
    }
  }

  return messages;
}

/**
 * Validates a WhatsApp webhook verification request.
 */
export function verifyWhatsAppWebhook(
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
