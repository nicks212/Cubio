import { NextRequest, NextResponse, after } from 'next/server';
import { adaptMetaPayload, verifyMetaWebhook, type MetaWebhookPayload } from '@/lib/webhooks/providerAdapters/metaAdapter';
import { processIncomingMessage } from '@/lib/webhooks/processIncomingMessage';
import { verifyMetaSignature } from '@/lib/webhooks/security';

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN ?? 'cubio_webhook_token';
// META_APP_SECRET        = main app secret (signs Facebook/Messenger payloads)
// META_IG_APP_SECRET     = Instagram-specific app secret (signs Instagram API payloads)
// If only one is set it is used for both. If neither is set, signature validation is skipped.
const META_APP_SECRET    = process.env.META_APP_SECRET;
const META_IG_APP_SECRET = process.env.META_IG_APP_SECRET;

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

  // Verify X-Hub-Signature-256 when app secret(s) are configured.
  // Facebook payloads are signed with META_APP_SECRET.
  // Instagram API payloads are signed with META_IG_APP_SECRET (separate secret shown on the
  // Instagram product page in Meta Developer Console). Falls back to META_APP_SECRET if
  // META_IG_APP_SECRET is not set, and to no validation if neither secret is configured.
  const sig = request.headers.get('x-hub-signature-256');
  let parsedObject: string | null = null;
  try { parsedObject = (JSON.parse(rawBody) as { object?: string }).object ?? null; } catch { /* will re-parse below */ }
  const isInstagram = parsedObject === 'instagram';
  const secretToUse = isInstagram
    ? (META_IG_APP_SECRET ?? META_APP_SECRET)
    : (META_APP_SECRET ?? META_IG_APP_SECRET);

  if (secretToUse) {
    if (!verifyMetaSignature(rawBody, sig, secretToUse)) {
      console.warn(`[webhook/meta] Invalid or missing X-Hub-Signature-256 for ${isInstagram ? 'instagram' : 'facebook'} — rejecting request`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
  } else {
    console.warn('[webhook/meta] No META_APP_SECRET / META_IG_APP_SECRET set — skipping signature validation');
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

