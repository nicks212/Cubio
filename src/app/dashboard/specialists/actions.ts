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

// ── Specialist types (simple name + active list) ──────────────────────────────
async function createNamed(table: 'specialist_types', name: string) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Name is empty' };
  const { error } = await a.supabase.from(table).insert({ name: trimmed, company_id: a.company_id });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/specialists');
  return { success: true };
}

async function deleteNamed(table: 'specialist_types', id: string) {
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

// ── Specialist weekly schedule (replace-all) + vacations ──────────────────────
const scheduleRowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
});

/**
 * Sets a specialist's recurring weekly working hours. Replace-all: deletes the
 * existing rows for this specialist and inserts the enabled weekdays. Deterministic
 * backend state — the availability engine and calendar read from here.
 */
export async function setSpecialistSchedule(
  specialistId: string,
  rows: Array<{ weekday: number; start_time: string; end_time: string }>,
) {
  const a = await authed();
  if ('error' in a) return { error: a.error };

  // Ownership check — specialist must belong to this company.
  const { data: owner } = await a.supabase.from('specialists').select('id').eq('id', specialistId).eq('company_id', a.company_id).single();
  if (!owner) return { error: 'Specialist not found' };

  const clean: Array<{ company_id: string; specialist_id: string; weekday: number; start_time: string; end_time: string }> = [];
  for (const r of rows) {
    const parsed = scheduleRowSchema.safeParse(r);
    if (!parsed.success) return { error: 'Invalid schedule row' };
    if (parsed.data.end_time <= parsed.data.start_time) return { error: 'End time must be after start time' };
    clean.push({ company_id: a.company_id, specialist_id: specialistId, ...parsed.data });
  }

  await a.supabase.from('specialist_schedules').delete().eq('specialist_id', specialistId).eq('company_id', a.company_id);
  if (clean.length > 0) {
    const { error } = await a.supabase.from('specialist_schedules').insert(clean);
    if (error) return { error: error.message };
  }
  revalidatePath('/dashboard/specialists');
  return { success: true };
}

export async function addSpecialistVacation(specialistId: string, startDate: string, endDate: string, label: string) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  if (!startDate || !endDate) return { error: 'Start and end dates required' };
  if (endDate < startDate) return { error: 'End date must be on or after start date' };

  const { data: owner } = await a.supabase.from('specialists').select('id').eq('id', specialistId).eq('company_id', a.company_id).single();
  if (!owner) return { error: 'Specialist not found' };

  const { error } = await a.supabase.from('specialist_vacations').insert({
    company_id: a.company_id, specialist_id: specialistId, start_date: startDate, end_date: endDate, label: label.trim() || null,
  });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/specialists');
  return { success: true };
}

export async function deleteSpecialistVacation(id: string) {
  const a = await authed();
  if ('error' in a) return { error: a.error };
  const { error } = await a.supabase.from('specialist_vacations').delete().eq('id', id).eq('company_id', a.company_id);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/specialists');
  return { success: true };
}
