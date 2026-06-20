'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const serviceSchema = z.object({
  service_name: z.string().min(1),
  description: z.string().optional(),
  category_id: z.string().uuid().optional().nullable(),
  specialist_type_id: z.string().uuid().optional().nullable(),
  gender_target: z.enum(['male', 'female', 'unisex']).default('unisex'),
  price_from: z.coerce.number().nonnegative().optional().nullable(),
  price_to: z.coerce.number().nonnegative().optional().nullable(),
  currency: z.enum(['GEL', 'USD']).default('GEL'),
  duration_minutes: z.coerce.number().int().positive().optional().nullable(),
  sessions_required: z.coerce.number().int().positive().default(1),
  preparation_instructions: z.string().optional(),
  consultation_required: z.string().optional().transform(v => v === 'true'),
  active: z.string().optional().transform(v => v === 'true'),
  service_target: z.enum(['human', 'pet', 'both']).default('human'),
  animal_type: z.string().optional(),
  breed: z.string().optional(),
  size_category: z.string().optional(),
  special_requirements: z.string().optional(),
});

async function getCompanyId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('company_id').eq('id', userId).single();
  return data?.company_id ?? null;
}

/** Coerce empty-string dropdown values to null so optional UUID FKs validate. */
function normalizeForm(formData: FormData): Record<string, unknown> {
  const obj = Object.fromEntries(formData) as Record<string, unknown>;
  for (const k of ['category_id', 'specialist_type_id', 'price_from', 'price_to', 'duration_minutes']) {
    if (obj[k] === '' || obj[k] === undefined) obj[k] = null;
  }
  return obj;
}

export async function createService(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  if (!company_id) return { error: 'No company' };

  const parsed = serviceSchema.safeParse(normalizeForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { error } = await supabase.from('services').insert({ ...parsed.data, company_id });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/services');
  return { success: true };
}

export async function updateService(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  const id = formData.get('id') as string;

  const parsed = serviceSchema.safeParse(normalizeForm(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { error } = await supabase.from('services').update(parsed.data)
    .eq('id', id).eq('company_id', company_id ?? '');
  if (error) return { error: error.message };
  revalidatePath('/dashboard/services');
  return { success: true };
}

export async function deleteService(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  // Soft delete to preserve any historical reservation references.
  const { error } = await supabase.from('services')
    .update({ deleted_at: new Date().toISOString(), active: false })
    .eq('id', id).eq('company_id', company_id ?? '');
  if (error) return { error: error.message };
  revalidatePath('/dashboard/services');
  return { success: true };
}
