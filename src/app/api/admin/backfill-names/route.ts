import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveMetaSenderName } from '@/lib/webhooks/processIncomingMessage';

/**
 * POST /api/admin/backfill-names
 *
 * Re-fetches Meta display names for all conversations where contact_name is NULL.
 * Then cascades the name to linked leads and escalations with null names.
 * Protected: caller must be authenticated as a user with a company.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) {
    return NextResponse.json({ error: 'No company found' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch all facebook/instagram integrations for the company (to get access tokens)
  const { data: integrations } = await admin
    .from('integrations')
    .select('id, provider, access_token')
    .eq('company_id', profile.company_id)
    .in('provider', ['facebook', 'instagram']);

  if (!integrations || integrations.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No Meta integrations found' });
  }

  // Build a map: provider -> access_token
  const tokenMap: Record<string, string> = {};
  for (const i of integrations) {
    if (i.provider && i.access_token) {
      tokenMap[i.provider as string] = i.access_token as string;
    }
  }

  // Find all conversations with null contact_name for this company and Meta providers
  const { data: conversations } = await admin
    .from('conversations')
    .select('id, provider, provider_conversation_id')
    .eq('company_id', profile.company_id)
    .in('provider', ['facebook', 'instagram'])
    .is('contact_name', null);

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No unnamed conversations found' });
  }

  let updated = 0;
  let failed = 0;

  for (const conv of conversations) {
    const provider = conv.provider as 'facebook' | 'instagram';
    const senderId = conv.provider_conversation_id as string;
    const accessToken = tokenMap[provider];

    if (!accessToken || !senderId) {
      failed++;
      continue;
    }

    const name = await resolveMetaSenderName(senderId, provider, accessToken);
    if (!name) {
      failed++;
      continue;
    }

    // Update conversation
    await admin.from('conversations').update({ contact_name: name }).eq('id', conv.id as string);

    // Cascade to leads and escalations with null names
    await Promise.all([
      admin.from('leads')
        .update({ name, provider_nickname: name })
        .eq('conversation_id', conv.id as string)
        .is('name', null),
      admin.from('escalations')
        .update({ contact_name: name, provider_nickname: name })
        .eq('conversation_id', conv.id as string)
        .is('contact_name', null),
    ]);

    updated++;
  }

  console.info(`[backfill-names] company=${profile.company_id} updated=${updated} failed=${failed}`);
  return NextResponse.json({ updated, failed, total: conversations.length });
}
