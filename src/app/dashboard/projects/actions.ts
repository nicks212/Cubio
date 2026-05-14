'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const projectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  location: z.string().optional(),
  completion_date: z.string().optional(),
  status: z.enum(['planning', 'construction', 'completed']),
  total_floors: z.coerce.number().int().positive().optional(),
  description: z.string().optional(),
});

export async function createProject(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  if (!profile?.company_id) return { error: 'No company found' };

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const imagesRaw = formData.get('images') as string;
  const images: string[] = imagesRaw ? (JSON.parse(imagesRaw) as string[]) : [];

  const { error } = await supabase.from('projects').insert({
    ...parsed.data,
    company_id: profile.company_id,
    completion_date: parsed.data.completion_date || null,
    total_floors: parsed.data.total_floors ?? null,
    images,
  });

  if (error) return { error: error.message };
  revalidatePath('/dashboard/projects');
  return { success: true };
}

export async function updateProject(_prev: unknown, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const id = formData.get('id') as string;
  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const imagesRaw = formData.get('images') as string;
  const images: string[] = imagesRaw ? (JSON.parse(imagesRaw) as string[]) : [];

  const { error } = await supabase.from('projects')
    .update({ ...parsed.data, completion_date: parsed.data.completion_date || null, images })
    .eq('id', id)
    .eq('company_id', profile?.company_id ?? '');

  if (error) return { error: error.message };
  revalidatePath('/dashboard/projects');
  return { success: true };
}

export async function deleteProject(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();

  const { error } = await supabase.from('projects')
    .delete()
    .eq('id', id)
    .eq('company_id', profile?.company_id ?? '');

  if (error) return { error: error.message };
  revalidatePath('/dashboard/projects');
  return { success: true };
}
