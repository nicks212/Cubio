import type { Provider } from './types';

/**
 * Outcome of a delivery attempt.
 *
 * `permanent` distinguishes "this will never work until a human fixes the integration"
 * (an expired or revoked token) from "this might work next time" (rate limit, 5xx,
 * network blip). Only the former is worth flagging the integration as broken.
 *
 * This type exists because the function used to return `void` and swallow every failure:
 * an Instagram token expired on 12 Aug 2026 and the bot went on generating replies that
 * were silently dropped for five weeks, while the dashboard showed a green "Connected".
 */
export type SendResult =
  | { ok: true }
  | { ok: false; permanent: boolean; error: string };

/** Meta error codes that mean the token itself is dead — reconnecting is the only fix. */
const META_AUTH_ERROR_CODES = new Set([
  190, // access token expired, revoked, or otherwise invalid
  102, // session key invalid or no longer valid
  200, // permission denied — the required scope was revoked
  10,  // permission denied — app lacks permission for this action
]);

/**
 * Classifies a Meta Graph API error body.
 * Exported for testing against real captured error payloads.
 */
export function classifyMetaError(status: number, body: string): { permanent: boolean; error: string } {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: number; type?: string } };
    const err = parsed.error;
    if (err) {
      const permanent =
        (typeof err.code === 'number' && META_AUTH_ERROR_CODES.has(err.code)) ||
        err.type === 'OAuthException';
      return { permanent, error: `${err.type ?? 'Error'} ${err.code ?? status}: ${err.message ?? body}` };
    }
  } catch {
    // Non-JSON body — fall through to the status-based classification below.
  }
  // 4xx other than 429 is a malformed request, not something a retry fixes; but it is not
  // an auth problem either, so it must not flag the integration for reconnection.
  return { permanent: false, error: `HTTP ${status}: ${body.slice(0, 300)}` };
}

/**
 * Sends a reply message back through the appropriate provider API.
 *
 * @param providerAccountId - The integration's provider_account_id.
 *   Required for WhatsApp (used as phone_number_id in the API URL).
 * @returns whether the message was actually delivered, and if not, whether the failure is
 *   permanent (dead token) or transient. Callers must not assume delivery succeeded.
 */
export async function sendProviderResponse(
  provider: Provider,
  senderId: string,
  replyText: string,
  accessToken: string,
  providerAccountId?: string,
): Promise<SendResult> {
  try {
    switch (provider) {
      case 'facebook':
        return await sendMetaResponse('messenger', senderId, replyText, accessToken);
      case 'instagram':
        return await sendMetaResponse('instagram', senderId, replyText, accessToken);
      case 'telegram':
        return await sendTelegramResponse(senderId, replyText, accessToken);
      case 'whatsapp': {
        const phoneNumberId = providerAccountId;
        if (!phoneNumberId) {
          console.error('[sendProviderResponse] WhatsApp: providerAccountId (phone_number_id) is missing');
          return { ok: false, permanent: true, error: 'WhatsApp phone_number_id missing on integration' };
        }
        return await sendWhatsAppResponse(senderId, replyText, accessToken, phoneNumberId);
      }
      case 'viber':
        return await sendViberResponse(senderId, replyText, accessToken);
      default:
        console.warn(`[sendProviderResponse] Unknown provider: ${provider}`);
        return { ok: false, permanent: true, error: `Unknown provider: ${provider}` };
    }
  } catch (err) {
    // Network-level throw — worth retrying, so never permanent.
    console.error(`[sendProviderResponse] Failed to send via ${provider}:`, err);
    return { ok: false, permanent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Meta (Facebook Messenger + Instagram) ──────────────────────────────────

async function sendMetaResponse(
  platform: 'messenger' | 'instagram',
  recipientId: string,
  text: string,
  pageAccessToken: string,
): Promise<SendResult> {
  if (!text.trim()) {
    console.error(`[sendMetaResponse] ${platform}: refusing to send empty message`);
    return { ok: false, permanent: false, error: 'empty message' };
  }
  const apiVersion = 'v22.0';
  // Instagram Login tokens (IGAA...) must use graph.instagram.com — graph.facebook.com rejects them.
  // Facebook page tokens always use graph.facebook.com.
  const baseHost = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
  const url = `${baseHost}/${apiVersion}/me/messages?access_token=${pageAccessToken}`;

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
    const { permanent, error } = classifyMetaError(res.status, errorBody);
    return { ok: false, permanent, error };
  }
  return { ok: true };
}

// ── Telegram ────────────────────────────────────────────────────────────────

async function sendTelegramResponse(
  chatId: string,
  text: string,
  botToken: string,
): Promise<SendResult> {
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
    return { ok: false, permanent: isAuthStatus(res.status), error: `HTTP ${res.status}: ${errorBody.slice(0, 300)}` };
  }
  return { ok: true };
}

/** 401/403 mean the credential itself was rejected — a human has to re-issue it. */
const isAuthStatus = (status: number): boolean => status === 401 || status === 403;

// ── WhatsApp Business API ────────────────────────────────────────────────────

async function sendWhatsAppResponse(
  recipientPhone: string,
  text: string,
  accessToken: string,
  phoneNumberId: string,
): Promise<SendResult> {
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
    // WhatsApp Cloud API is Graph, so it returns the same error envelope as Messenger.
    const { permanent, error } = classifyMetaError(res.status, errorBody);
    return { ok: false, permanent, error };
  }
  return { ok: true };
}

// ── Viber ────────────────────────────────────────────────────────────────────

async function sendViberResponse(
  receiverId: string,
  text: string,
  authToken: string,
): Promise<SendResult> {
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
    return { ok: false, permanent: isAuthStatus(res.status), error: `HTTP ${res.status}: ${errorBody.slice(0, 300)}` };
  }
  return { ok: true };
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
  // Final safety net: only send verified image formats.
  // All DB-stored images are .webp — reject anything else (gifs, unknown URLs, etc.)
  const safeUrls = urls.filter(u => /\.(webp|jpg|jpeg|png)/i.test(u));
  if (safeUrls.length !== urls.length) {
    console.warn(`[sendImageUrls] Blocked ${urls.length - safeUrls.length} non-image URL(s) from being sent`);
  }
  for (const url of safeUrls) {
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
  // Same IGAA token routing as sendMetaResponse.
  const baseHost = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
  const url = `${baseHost}/${apiVersion}/me/messages?access_token=${pageAccessToken}`;

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
