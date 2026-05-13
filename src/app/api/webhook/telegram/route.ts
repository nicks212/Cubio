import { NextRequest, NextResponse } from 'next/server';
import { adaptTelegramPayload, type TelegramWebhookPayload } from '@/lib/webhooks/providerAdapters/telegramAdapter';
import { processIncomingMessage } from '@/lib/webhooks/processIncomingMessage';

/**
 * Telegram Webhook
 *
 * Register with: https://api.telegram.org/bot{TOKEN}/setWebhook?url={SITE_URL}/api/webhook/telegram
 *
 * Telegram sends updates as POST requests with no GET verification step.
 * Each Telegram bot should point to this single endpoint.
 *
 * If you run multiple bots, you can use token-in-path routing:
 *   /api/webhook/telegram/[token]/route.ts
 * and pass the token as a path param. For now, a single shared endpoint
 * handles all active Telegram integrations via DB lookup.
 */
export async function POST(request: NextRequest) {
  let body: TelegramWebhookPayload;
  try {
    body = await request.json() as TelegramWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Must have update_id to be a valid Telegram update
  if (typeof body.update_id !== 'number') {
    return NextResponse.json({ status: 'ignored' });
  }

  console.info(`[webhook/telegram] update_id=${body.update_id}`);

  const msg = await adaptTelegramPayload(body);
  if (!msg) {
    // Non-text event (photo, sticker, etc.) or no active integration — silently ack
    return NextResponse.json({ status: 'ok' });
  }

  await processIncomingMessage(msg);

  return NextResponse.json({ status: 'ok' });
}
