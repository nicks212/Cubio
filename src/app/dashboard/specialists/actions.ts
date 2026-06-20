'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

async function getCompanyId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('company_id').eq('id', userId).single();
  return data?.company_id ?? null;
}

async function authed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' as const };
  const company_id = await getCompanyId(supabase, user.id);
  if (!company_id) return { error: 'No company' as const };
  return { supabase, company_id };
}

// ── Specialists ──────────────────────────────────────────────────────────────
const specialistSchema = z.object({
  specialist_name: z.string().min(1),
  specialist_type_id: z.string().uuid().optional().nullable(),
  active: z.string().optional().transform(v => v === 'true'),
});

export async function createSpecialist(_prev: unknown, formData: FormData) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const obj = Object.fromEntries(formData) as Record<string, unknown>;
  if (obj.specialist_type_id === '' ) obj.specialist_type_id = null;
  const parsed = specialistSchema.safeParse(obj);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const langRaw = (formData.get('languages') as string | null) ?? '';
  const languages = langRaw.split(',').map(s => s.trim()).filter(Boolean);
  const { error } = await a.supabase.from('specialists').insert({ ...parsed.data, languages, company_id: a.company_id });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/specialists');
  return { success: true };
}

export async function updateSpecialist(_prev: unknown, formData: FormData) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const id = formData.get('id') as string;
  const obj = Object.fromEntries(formData) as Record<string, unknown>;
  if (obj.specialist_type_id === '') obj.specialist_type_id = null;
  const parsed = specialistSchema.safeParse(obj);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const langRaw = (formData.get('languages') as string | null) ?? '';
  const languages = langRaw.split(',').map(s => s.trim()).filter(Boolean);
  const { error } = await a.supabase.from('specialists').update({ ...parsed.data, languages })
    .eq('id', id).eq('company_id', a.company_id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/specialists');
  return { success: true };
}

export async function deleteSpecialist(id: string) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const { error } = await a.supabase.from('specialists')
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq('id', id).eq('company_id', a.company_id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/specialists');
  return { success: true };
}

// ── Specialist types & categories (simple name + active lists) ────────────────
async function createNamed(table: 'specialist_types' | 'service_categories', name: string) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Name is empty' };
  const { error } = await a.supabase.from(table).insert({ name: trimmed, company_id: a.company_id });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/specialists');
  return { success: true };
}

async function deleteNamed(table: 'specialist_types' | 'service_categories', id: string) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const { error } = await a.supabase.from(table)
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq('id', id).eq('company_id', a.company_id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/specialists');
  return { success: true };
}

export async function createSpecialistType(name: string) { return createNamed('specialist_types', name); }
export async function deleteSpecialistType(id: string) { return deleteNamed('specialist_types', id); }
export async function createCategory(name: string) { return createNamed('service_categories', name); }
export async function deleteCategory(id: string) { return deleteNamed('service_categories', id); }
