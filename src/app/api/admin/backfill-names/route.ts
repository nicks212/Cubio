import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/backfill-names
 *
 * Re-fetches Meta display names for conversations where contact_name is NULL or 'Unknown'.
 * Cascades the name to linked leads and escalations.
 * Returns detailed errors so the caller can diagnose API failures.
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

  // Fetch all facebook/instagram integrations for the company (to get access tokens + page IDs)
  const { data: integrations } = await admin
    .from('integrations')
    .select('id, provider, access_token, provider_account_id')
    .eq('company_id', profile.company_id)
    .in('provider', ['facebook', 'instagram']);

  if (!integrations || integrations.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No Meta integrations found' });
  }

  // Build a map: provider -> { accessToken, pageId }
  const integrationMap: Record<string, { accessToken: string; pageId: string }> = {};
  for (const i of integrations) {
    if (i.provider && i.access_token && i.provider_account_id) {
      integrationMap[i.provider as string] = {
        accessToken: i.access_token as string,
        pageId: i.provider_account_id as string,
      };
    }
  }

  // Find conversations with null OR literal "Unknown" contact_name
  const { data: nullRows } = await admin
    .from('conversations')
    .select('id, provider, provider_conversation_id')
    .eq('company_id', profile.company_id)
    .in('provider', ['facebook', 'instagram'])
    .is('contact_name', null);

  const { data: unknownRows } = await admin
    .from('conversations')
    .select('id, provider, provider_conversation_id')
    .eq('company_id', profile.company_id)
    .in('provider', ['facebook', 'instagram'])
    .eq('contact_name', 'Unknown');

  const conversations = [...(nullRows ?? []), ...(unknownRows ?? [])];

  if (conversations.length === 0) {
    return NextResponse.json({ updated: 0, message: 'No unnamed conversations found' });
  }

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const conv of conversations) {
    const provider = conv.provider as 'facebook' | 'instagram';
    const senderId = conv.provider_conversation_id as string;
    const integration = integrationMap[provider];

    if (!integration) {
      errors.push(`No integration for provider: ${provider}`);
      failed++;
      continue;
    }
    if (!senderId) {
      errors.push(`Missing sender ID on conversation ${String(conv.id)}`);
      failed++;
      continue;
    }

    const { accessToken, pageId } = integration;
    let name: string | null = null;

    try {
      // Attempt 1: direct PSID/IGSID profile lookup
      const fields = provider === 'instagram' ? 'name,username' : 'name,first_name,last_name';
      const apiUrl = new URL(`https://graph.facebook.com/v22.0/${senderId}`);
      apiUrl.searchParams.set('fields', fields);
      apiUrl.searchParams.set('access_token', accessToken);
      const res = await fetch(apiUrl.toString());
      if (res.ok) {
        const data = JSON.parse(await res.text()) as { name?: string; first_name?: string; last_name?: string; username?: string };
        name = provider === 'instagram'
          ? (data.name ?? (data.username ? `@${data.username}` : null) ?? null)
          : (data.name ?? ([data.first_name, data.last_name].filter(Boolean).join(' ') || null));
      }

      // Attempt 2: Conversations API fallback (pages_messaging permission)
      if (!name) {
        const convUrl = new URL(`https://graph.facebook.com/v22.0/${pageId}/conversations`);
        convUrl.searchParams.set('user_id', senderId);
        convUrl.searchParams.set('fields', 'participants');
        convUrl.searchParams.set('access_token', accessToken);
        const convRes = await fetch(convUrl.toString());
        if (convRes.ok) {
          const convData = JSON.parse(await convRes.text()) as {
            data?: Array<{ participants?: { data?: Array<{ name?: string; id?: string }> } }>;
          };
          const thread = (convData.data ?? [])[0];
          const participants = thread?.participants?.data ?? [];
          const participant =
            participants.find(p => p.id === senderId) ??
            participants.find(p => p.id !== pageId);
          name = participant?.name ?? null;
        } else {
          const body = await convRes.text();
          errors.push(`${provider}/${senderId}: Conversations API ${convRes.status} — ${body.substring(0, 200)}`);
        }
      }

      if (!name) {
        errors.push(`${provider}/${senderId}: name unavailable from both profile and conversations API`);
        failed++;
        continue;
      }
    } catch (err) {
      errors.push(`${provider}/${senderId}: fetch threw — ${String(err)}`);
      failed++;
      continue;
    }

    // Update conversation
    await admin.from('conversations').update({ contact_name: name }).eq('id', conv.id as string);

    // Cascade to leads and escalations (null OR 'Unknown')
    await Promise.all([
      admin.from('leads')
        .update({ name, provider_nickname: name })
        .eq('conversation_id', conv.id as string)
        .or('name.is.null,name.eq.Unknown'),
      admin.from('escalations')
        .update({ contact_name: name, provider_nickname: name })
        .eq('conversation_id', conv.id as string)
        .or('contact_name.is.null,contact_name.eq.Unknown'),
    ]);

    updated++;
  }

  console.info(`[backfill-names] company=${profile.company_id} updated=${updated} failed=${failed} errors=${JSON.stringify(errors)}`);
  return NextResponse.json({ updated, failed, total: conversations.length, errors });
}
