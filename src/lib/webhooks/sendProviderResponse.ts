import type { Provider } from './types';

/**
 * Sends a reply message back through the appropriate provider API.
 *
 * @param providerAccountId - The integration's provider_account_id.
 *   Required for WhatsApp (used as phone_number_id in the API URL).
 */
export async function sendProviderResponse(
  provider: Provider,
  senderId: string,
  replyText: string,
  accessToken: string,
  providerAccountId?: string,
): Promise<void> {
  try {
    switch (provider) {
      case 'facebook':
        await sendMetaResponse('messenger', senderId, replyText, accessToken);
        break;
      case 'instagram':
        await sendMetaResponse('instagram', senderId, replyText, accessToken);
        break;
      case 'telegram':
        await sendTelegramResponse(senderId, replyText, accessToken);
        break;
      case 'whatsapp': {
        const phoneNumberId = providerAccountId;
        if (!phoneNumberId) {
          console.error('[sendProviderResponse] WhatsApp: providerAccountId (phone_number_id) is missing');
          return;
        }
        await sendWhatsAppResponse(senderId, replyText, accessToken, phoneNumberId);
        break;
      }
      case 'viber':
        await sendViberResponse(senderId, replyText, accessToken);
        break;
      default:
        console.warn(`[sendProviderResponse] Unknown provider: ${provider}`);
    }
  } catch (err) {
    console.error(`[sendProviderResponse] Failed to send via ${provider}:`, err);
  }
}

// ── Meta (Facebook Messenger + Instagram) ──────────────────────────────────

async function sendMetaResponse(
  platform: 'messenger' | 'instagram',
  recipientId: string,
  text: string,
  pageAccessToken: string,
): Promise<void> {
  const apiVersion = 'v19.0';
  const url = `https://graph.facebook.com/${apiVersion}/me/messages?access_token=${pageAccessToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: 'RESPONSE',
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[sendMetaResponse] ${platform} API error:`, errorBody);
  }
}

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegramResponse(
  chatId: string,
  text: string,
  botToken: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[sendTelegramResponse] Telegram API error:', errorBody);
  }
}

// ── WhatsApp Business API ────────────────────────────────────────────────────

async function sendWhatsAppResponse(
  recipientPhone: string,
  text: string,
  accessToken: string,
  phoneNumberId: string,
): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'text',
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[sendWhatsAppResponse] WhatsApp API error:', errorBody);
  }
}

// ── Viber ────────────────────────────────────────────────────────────────────

async function sendViberResponse(
  receiverId: string,
  text: string,
  authToken: string,
): Promise<void> {
  const url = 'https://chatapi.viber.com/pa/send_message';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Viber-Auth-Token': authToken,
    },
    body: JSON.stringify({
      receiver: receiverId,
      min_api_version: 1,
      sender: { name: 'Cubio AI' },
      type: 'text',
      text,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[sendViberResponse] Viber API error:', errorBody);
  }
}
