import { NextRequest, NextResponse } from 'next/server';
import { adaptViberPayload, verifyViberSignature, type ViberWebhookPayload } from '@/lib/webhooks/providerAdapters/viberAdapter';
import { processIncomingMessage } from '@/lib/webhooks/processIncomingMessage';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Viber Webhook
 *
 * Setup:
 * 1. Call Viber API: POST https://chatapi.viber.com/pa/set_webhook
 *    { "url": "{SITE_URL}/api/webhook/viber", "event_types": ["message"] }
 *    with X-Viber-Auth-Token header set to your bot's auth token
 *
 * 2. The bot_id (Public Account URI) is stored as provider_account_id in integrations.
 *
 * Signature validation:
 * Viber sends X-Viber-Content-Signature header — HMAC-SHA256 of the body
 * using the auth token as key. We validate it before processing.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Parse JSON
  let body: ViberWebhookPayload;
  try {
    body = JSON.parse(rawBody) as ViberWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Resolve the Viber bot's auth token and account ID from active integration
  const supabase = createAdminClient();
  const { data: integration } = await supabase
    .from('integrations')
    .select('provider_account_id, access_token')
    .eq('provider', 'viber')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!integration) {
    // No Viber integration configured — ack silently
    return NextResponse.json({ status: 'ok' });
  }

  const authToken = integration.access_token as string;
  const botId = integration.provider_account_id as string;

  // Validate signature (skip for `conversation_started` / `subscribed` events which may not be signed)
  const signature = request.headers.get('x-viber-content-signature');
  if (signature && !verifyViberSignature(rawBody, signature, authToken)) {
    console.warn('[webhook/viber] Invalid signature — rejecting request');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  console.info(`[webhook/viber] event=${body.event}`);

  const msg = adaptViberPayload(body, botId);
  if (!msg) {
    // Non-message event (subscribed, delivered, seen, etc.) — ack
    return NextResponse.json({ status: 'ok' });
  }

  await processIncomingMessage(msg);

  return NextResponse.json({ status: 'ok' });
}
