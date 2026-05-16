'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

export async function updateProfile(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const full_name = formData.get('full_name') as string;
  const { error } = await supabase.from('profiles').update({ full_name }).eq('id', user.id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/settings');
  return { success: true };
}

export async function updateCompany(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) return { error: 'No company' };

  const company_name = formData.get('company_name') as string;
  const ai_enabled = formData.get('ai_enabled') === 'true';
  const business_description = ((formData.get('business_description') as string | null) ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 1000) || null;

  // Save core fields — always safe
  const { error } = await supabase
    .from('companies')
    .update({ company_name, ai_enabled })
    .eq('id', profile.company_id);
  if (error) return { error: error.message };

  // Save business_description separately — column requires migration 005 to be applied.
  // If the column doesn't exist yet, skip silently so the rest of the form still saves.
  if (business_description !== null || formData.has('business_description')) {
    const { error: descError } = await supabase
      .from('companies')
      .update({ business_description } as Record<string, unknown>)
      .eq('id', profile.company_id);
    if (descError && !descError.message.includes('schema cache') && !descError.message.includes('column')) {
      return { error: descError.message };
    }
  }

  revalidatePath('/dashboard/settings');
  return { success: true };
}

export async function changePassword(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const schema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm: z.string(),
  }).refine(d => d.password === d.confirm, { message: 'Passwords do not match', path: ['confirm'] });

  const parsed = schema.safeParse({ password: formData.get('password'), confirm: formData.get('confirm') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };
  return { success: true };
}
