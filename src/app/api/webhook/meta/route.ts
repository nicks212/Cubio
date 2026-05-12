import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { generateReply } from '@/lib/ai';

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN ?? 'cubio_webhook_token';

// GET: Webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST: Receive messages
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = await createAdminClient();

  // Process Meta webhook events
  if (body.object === 'page' || body.object === 'instagram') {
    const entries = (body.entry as Array<{ id: string; messaging?: unknown[]; changes?: unknown[] }>) ?? [];

    for (const entry of entries) {
      const messaging = entry.messaging ?? [];
      for (const event of messaging as Array<Record<string, unknown>>) {
        await processEvent(supabase, event, body.object as string);
      }
    }
  }

  // Telegram
  if (body.update_id) {
    await processTelegramUpdate(supabase, body);
  }

  return NextResponse.json({ status: 'ok' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processEvent(supabase: any, event: Record<string, unknown>, provider: string) {
  const sender = event.sender as { id: string } | undefined;
  const message = event.message as { text?: string } | undefined;
  if (!sender?.id || !message?.text) return;

  const providerAccountId = (event.recipient as { id: string } | undefined)?.id;
  if (!providerAccountId) return;

  // Find integration
  const { data: integration } = await supabase
    .from('integrations')
    .select('*, company:companies(id, business_type, ai_enabled)')
    .eq('provider_account_id', providerAccountId)
    .eq('is_active', true)
    .single();

  if (!integration || !integration.company?.ai_enabled) return;

  const companyId = integration.company.id;
  const businessType = integration.company.business_type;

  // Find or create conversation
  let { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .eq('provider_conversation_id', sender.id)
    .eq('status', 'open')
    .single();

  if (!conversation) {
    const { data: newConv } = await supabase.from('conversations').insert({
      company_id: companyId,
      integration_id: integration.id,
      provider,
      provider_conversation_id: sender.id,
      status: 'open',
    }).select('id').single();
    conversation = newConv;
  }

  if (!conversation) return;

  // Save incoming message
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    company_id: companyId,
    role: 'user',
    content: message.text,
  });

  // Load context for AI
  let businessContext;
  if (businessType === 'real_estate') {
    const { data: apartments } = await supabase
      .from('apartments')
      .select('*, project:projects(name)')
      .eq('company_id', companyId)
      .eq('status', 'vacant')
      .is('deleted_at', null)
      .limit(20);
    businessContext = { apartments: apartments ?? [] };
  } else {
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('company_id', companyId)
      .eq('in_stock', true)
      .is('deleted_at', null)
      .limit(20);
    businessContext = { products: products ?? [] };
  }

  // Get recent history
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(6);

  const reply = await generateReply(
    message.text,
    businessContext,
    businessType,
    (history ?? []).reverse(),
  );

  // Save AI reply
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    company_id: companyId,
    role: 'ai',
    content: reply,
  });

  // TODO: Send reply back via platform API (Facebook/Instagram Graph API, Telegram Bot API, etc.)
  // This requires platform-specific implementation and is triggered here.
  console.log(`[Webhook] AI reply for ${provider}/${sender.id}: ${reply.slice(0, 100)}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processTelegramUpdate(supabase: any, update: Record<string, unknown>) {
  const msg = update.message as { chat?: { id: number }; text?: string; from?: { id: number; first_name?: string } } | undefined;
  if (!msg?.text || !msg.chat?.id) return;

  // Find telegram integration by looking up all telegram integrations
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*, company:companies(id, business_type, ai_enabled)')
    .eq('provider', 'telegram')
    .eq('is_active', true);

  if (!integrations?.length) return;

  // Use first active telegram integration (single-bot setup)
  const integration = integrations[0];
  if (!integration.company?.ai_enabled) return;

  const companyId = integration.company.id;
  const businessType = integration.company.business_type;
  const chatId = String(msg.chat.id);

  let { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('company_id', companyId)
    .eq('provider', 'telegram')
    .eq('provider_conversation_id', chatId)
    .eq('status', 'open')
    .single();

  if (!conversation) {
    const { data: newConv } = await supabase.from('conversations').insert({
      company_id: companyId,
      integration_id: integration.id,
      provider: 'telegram',
      provider_conversation_id: chatId,
      contact_name: msg.from?.first_name ?? null,
      status: 'open',
    }).select('id').single();
    conversation = newConv;
  }

  if (!conversation) return;

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    company_id: companyId,
    role: 'user',
    content: msg.text,
  });

  let businessContext;
  if (businessType === 'real_estate') {
    const { data: apartments } = await supabase.from('apartments').select('*, project:projects(name)').eq('company_id', companyId).eq('status', 'vacant').is('deleted_at', null).limit(20);
    businessContext = { apartments: apartments ?? [] };
  } else {
    const { data: products } = await supabase.from('products').select('*').eq('company_id', companyId).eq('in_stock', true).is('deleted_at', null).limit(20);
    businessContext = { products: products ?? [] };
  }

  const reply = await generateReply(msg.text, businessContext, businessType);

  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    company_id: companyId,
    role: 'ai',
    content: reply,
  });

  // Send Telegram reply
  if (integration.access_token) {
    await fetch(`https://api.telegram.org/bot${integration.access_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });
  }
}
