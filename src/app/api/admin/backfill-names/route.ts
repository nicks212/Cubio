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
    const accessToken = tokenMap[provider];

    if (!accessToken) {
      errors.push(`No access token for provider: ${provider}`);
      failed++;
      continue;
    }
    if (!senderId) {
      errors.push(`Missing sender ID on conversation ${String(conv.id)}`);
      failed++;
      continue;
    }

    // Make the Meta Graph API call directly so we can capture the exact error
    const fields = provider === 'instagram' ? 'name,username' : 'name,first_name,last_name';
    const apiUrl = new URL(`https://graph.facebook.com/v22.0/${senderId}`);
    apiUrl.searchParams.set('fields', fields);
    apiUrl.searchParams.set('access_token', accessToken);

    let name: string | null = null;
    try {
      const res = await fetch(apiUrl.toString());
      const body = await res.text();
      if (!res.ok) {
        errors.push(`${provider}/${senderId}: HTTP ${res.status} — ${body.substring(0, 300)}`);
        failed++;
        continue;
      }
      const data = JSON.parse(body) as { name?: string; first_name?: string; last_name?: string; username?: string };
      if (provider === 'instagram') {
        name = data.name ?? (data.username ? `@${data.username}` : null) ?? null;
      } else {
        name = data.name ??
          ([data.first_name, data.last_name].filter(Boolean).join(' ') || null) ??
          null;
      }
      if (!name) {
        errors.push(`${provider}/${senderId}: API returned no name — ${body.substring(0, 200)}`);
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
