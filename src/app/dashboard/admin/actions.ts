'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { registerTelegramWebhook } from '@/lib/webhooks/providerAdapters/telegramAdapter';

async function isAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  return data?.is_admin === true;
}

export async function toggleUserAdmin(userId: string, is_admin: boolean) {
  if (!await isAdmin()) return { error: 'Unauthorized' };
  const supabase = createAdminClient();
  const { error } = await supabase.from('profiles').update({ is_admin }).eq('id', userId);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/admin');
  return { success: true };
}

export async function upsertLocalization(_prev: unknown, formData: FormData) {
  if (!await isAdmin()) return { error: 'Unauthorized' };
  const supabase = createAdminClient();
  const keyword = formData.get('keyword') as string;
  const localization_text = formData.get('localization_text') as string;
  const localization_text_en = (formData.get('localization_text_en') as string) ?? '';
  if (!keyword || !localization_text) return { error: 'Key and text are required' };

  // Always upsert by keyword — works for both new strings and edits to default keys
  const { error } = await supabase
    .from('localizations')
    .upsert({ keyword, localization_text, localization_text_en }, { onConflict: 'keyword' });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/admin');
  (revalidateTag as (tag: string) => void)('translations');
  return { success: true };
}

export async function deleteLocalization(id: string) {
  if (!await isAdmin()) return { error: 'Unauthorized' };
  const supabase = createAdminClient();
  await supabase.from('localizations').delete().eq('id', id);
  revalidatePath('/dashboard/admin');
  (revalidateTag as (tag: string) => void)('translations');
  return { success: true };
}

export async function createIntegration(_prev: unknown, formData: FormData) {
  if (!await isAdmin()) return { error: 'Unauthorized' };
  const supabase = createAdminClient();

  const { error } = await supabase.from('integrations').insert({
    company_id: formData.get('company_id') as string,
    provider: formData.get('provider') as string,
    provider_account_id: formData.get('provider_account_id') as string,
    account_name: formData.get('account_name') as string,
    access_token: formData.get('access_token') as string,
    refresh_token: formData.get('refresh_token') as string || null,
    is_active: formData.get('is_active') === 'true',
  });
  if (error) return { error: error.message };

  // Auto-register Telegram webhook when a Telegram integration is created
  const provider = formData.get('provider') as string;
  const accessToken = formData.get('access_token') as string;
  if (provider === 'telegram' && accessToken) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl) {
      await registerTelegramWebhook(accessToken, `${siteUrl}/api/webhook/telegram`);
    } else {
      console.warn('[createIntegration] NEXT_PUBLIC_SITE_URL not set — Telegram webhook not auto-registered');
    }
  }

  revalidatePath('/dashboard/admin');
  return { success: true };
}

export async function updateIntegration(_prev: unknown, formData: FormData) {
  if (!await isAdmin()) return { error: 'Unauthorized' };
  const supabase = createAdminClient();
  const id = formData.get('id') as string;

  const { error } = await supabase.from('integrations').update({
    company_id: formData.get('company_id') as string,
    provider: formData.get('provider') as string,
    provider_account_id: formData.get('provider_account_id') as string,
    account_name: formData.get('account_name') as string,
    access_token: formData.get('access_token') as string,
    refresh_token: formData.get('refresh_token') as string || null,
    is_active: formData.get('is_active') === 'true',
  }).eq('id', id);
  if (error) return { error: error.message };

  // Re-register Telegram webhook if the token or active status changed
  const provider = formData.get('provider') as string;
  const accessToken = formData.get('access_token') as string;
  if (provider === 'telegram' && accessToken) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl) {
      await registerTelegramWebhook(accessToken, `${siteUrl}/api/webhook/telegram`);
    }
  }

  revalidatePath('/dashboard/admin');
  return { success: true };
}

export async function deleteIntegration(id: string) {
  if (!await isAdmin()) return { error: 'Unauthorized' };
  const supabase = createAdminClient();
  await supabase.from('integrations').delete().eq('id', id);
  revalidatePath('/dashboard/admin');
  return { success: true };
}

export async function toggleIntegration(id: string, is_active: boolean) {
  if (!await isAdmin()) return { error: 'Unauthorized' };
  const supabase = createAdminClient();
  const { error } = await supabase.from('integrations').update({ is_active }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/admin');
  return { success: true };
}

export async function adminListConversations(companyId: string) {
  if (!await isAdmin()) return { error: 'Unauthorized', conversations: [] };
  if (!companyId) return { conversations: [] };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });
  if (error) return { error: error.message, conversations: [] };
  return { conversations: data ?? [] };
}

export async function adminListMessages(conversationId: string) {
  if (!await isAdmin()) return { error: 'Unauthorized', messages: [] };
  if (!conversationId) return { messages: [] };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at');
  if (error) return { error: error.message, messages: [] };
  return { messages: data ?? [] };
}

export async function adminListLeads(companyId: string) {
  if (!await isAdmin()) return { error: 'Unauthorized', leads: [] };
  if (!companyId) return { leads: [] };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) return { error: error.message, leads: [] };
  return { leads: data ?? [] };
}

export async function adminListEscalations(companyId: string) {
  if (!await isAdmin()) return { error: 'Unauthorized', escalations: [] };
  if (!companyId) return { escalations: [] };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('escalations')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (error) return { error: error.message, escalations: [] };
  return { escalations: data ?? [] };
}

export async function adminListReservations(companyId: string) {
  if (!await isAdmin()) return { error: 'Unauthorized', reservations: [] };
  if (!companyId) return { reservations: [] };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('reservations')
    .select('*, service:services(service_name), specialist:specialists(specialist_name)')
    .eq('company_id', companyId)
    .order('reservation_date', { ascending: false })
    .order('reservation_start_time', { ascending: false });
  if (error) return { error: error.message, reservations: [] };
  return { reservations: data ?? [] };
}

export async function upsertTermsContent(language: string, content: string): Promise<{ success?: boolean; error?: string }> {
  if (!await isAdmin()) return { error: 'Unauthorized' };
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('terms_content')
    .upsert({ language, content, updated_at: new Date().toISOString() }, { onConflict: 'language' });
  if (error) return { error: error.message };
  return { success: true };
}
