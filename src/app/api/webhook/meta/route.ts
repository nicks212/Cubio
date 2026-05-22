import { NextRequest, NextResponse, after } from 'next/server';
import { adaptMetaPayload, verifyMetaWebhook, type MetaWebhookPayload } from '@/lib/webhooks/providerAdapters/metaAdapter';
import { processIncomingMessage } from '@/lib/webhooks/processIncomingMessage';
import { verifyMetaSignature } from '@/lib/webhooks/security';

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN ?? 'cubio_webhook_token';
const META_APP_SECRET = process.env.META_APP_SECRET;

// GET: Webhook verification (Facebook / Instagram)
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const challenge = verifyMetaWebhook(
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
  // Required in production to ensure requests genuinely come from Meta.
  if (META_APP_SECRET) {
    const sig = request.headers.get('x-hub-signature-256');
    if (!verifyMetaSignature(rawBody, sig, META_APP_SECRET)) {
      console.warn('[webhook/meta] Invalid or missing X-Hub-Signature-256 — rejecting request');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
  } else {
    console.warn('[webhook/meta] META_APP_SECRET not set — skipping signature validation');
  }

  let body: MetaWebhookPayload;
  try {
    body = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Only handle page / instagram objects
  if (body.object !== 'page' && body.object !== 'instagram') {
    return NextResponse.json({ status: 'ignored' });
  }

  const messages = adaptMetaPayload(body);
  console.info(`[webhook/meta] Received ${messages.length} message(s) from ${body.object}`);

  // Respond 200 immediately — Meta requires it within 20s.
  // Processing (which includes the debounce sleep) runs AFTER the response is sent.
  after(() => Promise.allSettled(messages.map(msg => processIncomingMessage(msg))));

  return NextResponse.json({ status: 'ok' });
}

