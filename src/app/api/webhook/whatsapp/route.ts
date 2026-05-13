import { NextRequest, NextResponse } from 'next/server';
import { adaptWhatsAppPayload, verifyWhatsAppWebhook, type WhatsAppWebhookPayload } from '@/lib/webhooks/providerAdapters/whatsappAdapter';
import { processIncomingMessage } from '@/lib/webhooks/processIncomingMessage';
import { verifyMetaSignature } from '@/lib/webhooks/security';

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN ?? 'cubio_webhook_token';
const META_APP_SECRET = process.env.META_APP_SECRET;

/**
 * WhatsApp Business API Webhook
 *
 * Setup:
 * 1. Go to Meta for Developers → Your App → WhatsApp → Configuration
 * 2. Set Callback URL to: {SITE_URL}/api/webhook/whatsapp
 * 3. Set Verify Token to your WEBHOOK_VERIFY_TOKEN env value
 * 4. Subscribe to: messages
 *
 * The phone_number_id in the webhook metadata is used to identify
 * which integration (company) the message belongs to.
 */

// GET: Webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const challenge = verifyWhatsAppWebhook(
    searchParams.get('hub.mode'),
    searchParams.get('hub.verify_token'),
    searchParams.get('hub.challenge'),
    VERIFY_TOKEN,
  );

  if (challenge !== null) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST: Receive messages
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  // Verify X-Hub-Signature-256 when META_APP_SECRET is configured.
  // WhatsApp Business API uses the same Meta signature scheme as Messenger/Instagram.
  if (META_APP_SECRET) {
    const sig = request.headers.get('x-hub-signature-256');
    if (!verifyMetaSignature(rawBody, sig, META_APP_SECRET)) {
      console.warn('[webhook/whatsapp] Invalid or missing X-Hub-Signature-256 — rejecting request');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
  } else {
    console.warn('[webhook/whatsapp] META_APP_SECRET not set — skipping signature validation');
  }

  let body: WhatsAppWebhookPayload;
  try {
    body = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.object !== 'whatsapp_business_account') {
    return NextResponse.json({ status: 'ignored' });
  }

  const messages = adaptWhatsAppPayload(body);
  console.info(`[webhook/whatsapp] Received ${messages.length} message(s)`);

  await Promise.allSettled(messages.map(msg => processIncomingMessage(msg)));

  return NextResponse.json({ status: 'ok' });
}
