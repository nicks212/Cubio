'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';

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
  if (!keyword || !localization_text) return { error: 'Key and text are required' };

  // Always upsert by keyword — works for both new strings and edits to default keys
  const { error } = await supabase
    .from('localizations')
    .upsert({ keyword, localization_text }, { onConflict: 'keyword' });
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
