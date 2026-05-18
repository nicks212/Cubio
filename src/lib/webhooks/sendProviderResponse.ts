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
  if (!text.trim()) {
    console.error(`[sendMetaResponse] ${platform}: refusing to send empty message`);
    return;
  }
  const apiVersion = 'v22.0';
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
  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

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

// ── Image sending ─────────────────────────────────────────────────────────────

/**
 * Sends one or more image URLs as separate messages via the appropriate provider API.
 * Called after the text reply when the AI includes a PHOTOS: line.
 */
export async function sendImageUrls(
  provider: Provider,
  senderId: string,
  urls: string[],
  accessToken: string,
  providerAccountId?: string,
): Promise<void> {
  for (const url of urls) {
    try {
      switch (provider) {
        case 'facebook':
          await sendMetaImage('messenger', senderId, url, accessToken);
          break;
        case 'instagram':
          await sendMetaImage('instagram', senderId, url, accessToken);
          break;
        case 'telegram':
          await sendTelegramPhoto(senderId, url, accessToken);
          break;
        case 'whatsapp': {
          if (!providerAccountId) break;
          await sendWhatsAppImage(senderId, url, accessToken, providerAccountId);
          break;
        }
        // Viber image API requires additional sender profile setup; skip for now
        default:
          break;
      }
    } catch (err) {
      console.error(`[sendImageUrls] Failed to send image via ${provider}:`, err);
    }
  }
}

async function sendMetaImage(
  platform: 'messenger' | 'instagram',
  recipientId: string,
  imageUrl: string,
  pageAccessToken: string,
): Promise<void> {
  const apiVersion = 'v22.0';
  const url = `https://graph.facebook.com/${apiVersion}/me/messages?access_token=${pageAccessToken}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: 'image',
          payload: { url: imageUrl, is_reusable: true },
        },
      },
      messaging_type: 'RESPONSE',
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`[sendMetaImage] ${platform} API error:`, errorBody);
  }
}

async function sendTelegramPhoto(
  chatId: string,
  photoUrl: string,
  botToken: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, photo: photoUrl }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[sendTelegramPhoto] Telegram API error:', errorBody);
  }
}

async function sendWhatsAppImage(
  recipientPhone: string,
  imageUrl: string,
  accessToken: string,
  phoneNumberId: string,
): Promise<void> {
  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'image',
      image: { link: imageUrl },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error('[sendWhatsAppImage] WhatsApp API error:', errorBody);
  }
}
