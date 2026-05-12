'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.coerce.number().positive(),
  category: z.string().optional(),
  material: z.string().optional(),
  birthstones: z.string().optional(),
  in_stock: z.string().optional().transform(v => v === 'true'),
});

async function getCompanyId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('company_id').eq('id', userId).single();
  return data?.company_id ?? null;
}

export async function createProduct(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  if (!company_id) return { error: 'No company' };

  const zodiacRaw = formData.get('zodiac_compatibility') as string;
  const zodiac_compatibility = zodiacRaw ? zodiacRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { error } = await supabase.from('products').insert({
    ...parsed.data,
    company_id,
    zodiac_compatibility,
  });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/products');
  return { success: true };
}

export async function updateProduct(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  const id = formData.get('id') as string;

  const zodiacRaw = formData.get('zodiac_compatibility') as string;
  const zodiac_compatibility = zodiacRaw ? zodiacRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { error } = await supabase.from('products').update({ ...parsed.data, zodiac_compatibility })
    .eq('id', id).eq('company_id', company_id ?? '');
  if (error) return { error: error.message };
  revalidatePath('/dashboard/products');
  return { success: true };
}

export async function deleteProduct(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  const { error } = await supabase.from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', company_id ?? '');
  if (error) return { error: error.message };
  revalidatePath('/dashboard/products');
  return { success: true };
}
