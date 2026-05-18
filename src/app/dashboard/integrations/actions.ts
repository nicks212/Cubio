'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ── Validate Facebook/Instagram token and get page info ──────────────────────
async function fetchMetaPageInfo(accessToken: string): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/me?access_token=${encodeURIComponent(accessToken)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data = await res.json() as { id?: string; name?: string };
    if (!data.id) return null;
    return { id: data.id, name: data.name ?? data.id };
  } catch {
    return null;
  }
}

// ── Validate Telegram bot token and get bot info ──────────────────────────────
async function fetchTelegramBotInfo(token: string): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; result?: { id: number; username?: string; first_name?: string } };
    if (!data.ok || !data.result) return null;
    return {
      id: String(data.result.id),
      name: data.result.username ? `@${data.result.username}` : (data.result.first_name ?? String(data.result.id)),
    };
  } catch {
    return null;
  }
}

// ── Save / update an integration ─────────────────────────────────────────────
export async function saveIntegration(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  if (!profile?.company_id) return { error: 'No company found' };

  const provider = formData.get('provider') as string;
  const accessToken = (formData.get('access_token') as string ?? '').trim();
  const manualAccountId = (formData.get('provider_account_id') as string ?? '').trim();
  const manualAccountName = (formData.get('account_name') as string ?? '').trim();

  if (!provider || !accessToken) return { error: 'Provider and access token are required' };

  let providerAccountId = manualAccountId;
  let accountName = manualAccountName || provider;

  // Auto-detect page info from API
  if (provider === 'facebook' || provider === 'instagram') {
    const pageInfo = await fetchMetaPageInfo(accessToken);
    if (!pageInfo) return { error: 'Invalid access token — could not fetch page info from Meta API. Please check the token.' };
    providerAccountId = pageInfo.id;
    accountName = manualAccountName || pageInfo.name;
  } else if (provider === 'telegram') {
    const botInfo = await fetchTelegramBotInfo(accessToken);
    if (!botInfo) return { error: 'Invalid bot token — could not connect to Telegram API. Please check the token.' };
    providerAccountId = botInfo.id;
    accountName = manualAccountName || botInfo.name;
  }

  if (!providerAccountId) return { error: 'Account ID is required for this provider' };

  // Upsert integration — unique on (provider, provider_account_id)
  const { error } = await supabase
    .from('integrations')
    .upsert(
      {
        company_id: profile.company_id,
        provider,
        provider_account_id: providerAccountId,
        account_name: accountName,
        access_token: accessToken,
        is_active: true,
      },
      { onConflict: 'provider,provider_account_id' },
    );

  if (error) return { error: error.message };

  revalidatePath('/dashboard/integrations');
  return { success: true, accountName, providerAccountId };
}

// ── Deactivate an integration ─────────────────────────────────────────────────
export async function deleteIntegration(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();
  if (!profile?.company_id) return { error: 'No company found' };

  const provider = formData.get('provider') as string;
  if (!provider) return { error: 'Provider is required' };

  const { error } = await supabase
    .from('integrations')
    .delete()
    .eq('company_id', profile.company_id)
    .eq('provider', provider);

  if (error) return { error: error.message };

  revalidatePath('/dashboard/integrations');
  return { success: true };
}
