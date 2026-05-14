'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const aptSchema = z.object({
  project_id: z.string().uuid(),
  apartment_number: z.string().min(1),
  size_sq_m: z.coerce.number().positive(),
  floor: z.coerce.number().int().min(1),
  rooms_quantity: z.coerce.number().int().min(1),
  price_per_sq_m: z.coerce.number().positive(),
  total_price: z.coerce.number().positive(),
  status: z.enum(['vacant', 'reserved', 'sold']),
  description: z.string().optional(),
});

async function getCompanyId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('company_id').eq('id', userId).single();
  return data?.company_id ?? null;
}

export async function createApartment(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  if (!company_id) return { error: 'No company' };

  const parsed = aptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const imagesRaw = formData.get('images') as string;
  const images: string[] = imagesRaw ? (JSON.parse(imagesRaw) as string[]) : [];

  const { error } = await supabase.from('apartments').insert({ ...parsed.data, company_id, images });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/apartments');
  return { success: true };
}

export async function updateApartment(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  const id = formData.get('id') as string;

  const parsed = aptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const imagesRaw = formData.get('images') as string;
  const images: string[] = imagesRaw ? (JSON.parse(imagesRaw) as string[]) : [];

  const { error } = await supabase.from('apartments').update({ ...parsed.data, images }).eq('id', id).eq('company_id', company_id ?? '');
  if (error) return { error: error.message };
  revalidatePath('/dashboard/apartments');
  return { success: true };
}

export async function deleteApartment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  // Soft delete
  const { error } = await supabase.from('apartments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).eq('company_id', company_id ?? '');
  if (error) return { error: error.message };
  revalidatePath('/dashboard/apartments');
  return { success: true };
}

export async function updateApartmentStatus(id: string, status: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  const { error } = await supabase.from('apartments').update({ status }).eq('id', id).eq('company_id', company_id ?? '');
  if (error) return { error: error.message };
  revalidatePath('/dashboard/apartments');
  return { success: true };
}

export async function bulkCreateApartments(data: {
  company_id: string;
  project_id: string;
  template_size: number;
  template_rooms: number;
  template_price: number;
  start_floor: number;
  end_floor: number;
  units_per_floor: number;
  price_adjustment: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const apartments = [];
  for (let floor = data.start_floor; floor <= data.end_floor; floor++) {
    const priceMultiplier = 1 + ((floor - data.start_floor) * data.price_adjustment) / 100;
    const pricePerSqm = Math.round(data.template_price * priceMultiplier);
    for (let unit = 1; unit <= data.units_per_floor; unit++) {
      apartments.push({
        company_id: data.company_id,
        project_id: data.project_id,
        apartment_number: `${floor.toString().padStart(2, '0')}${unit.toString().padStart(2, '0')}`,
        size_sq_m: data.template_size,
        floor,
        rooms_quantity: data.template_rooms,
        price_per_sq_m: pricePerSqm,
        total_price: Math.round(data.template_size * pricePerSqm),
        status: 'vacant' as const,
      });
    }
  }

  const { error } = await supabase.from('apartments').insert(apartments);
  if (error) return { error: error.message };
  revalidatePath('/dashboard/apartments');
  return { success: true, count: apartments.length };
}

export async function createTemplate(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);

  const { error } = await supabase.from('apartment_templates').insert({
    company_id,
    name: formData.get('name') as string,
    size_sq_m: Number(formData.get('size_sq_m')),
    rooms_quantity: Number(formData.get('rooms_quantity')),
    price_per_sq_m: Number(formData.get('price_per_sq_m')),
    images: (() => { try { return JSON.parse(formData.get('images') as string ?? '[]') as string[]; } catch { return []; } })(),
  });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/apartments');
  return { success: true };
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };
  const company_id = await getCompanyId(supabase, user.id);
  await supabase.from('apartment_templates').delete().eq('id', id).eq('company_id', company_id ?? '');
  revalidatePath('/dashboard/apartments');
  return { success: true };
}
