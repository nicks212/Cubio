'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const setupSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  businessType: z.enum(['real_estate', 'craft_shop'], { message: 'Please select a business type' }),
});

export async function setupCompany(_prev: unknown, formData: FormData) {
  const parsed = setupSchema.safeParse({
    companyName: formData.get('companyName'),
    businessType: formData.get('businessType'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Check if company already exists for this user (e.g. page refresh)
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, full_name')
    .eq('id', user.id)
    .single();

  if (profile?.company_id) {
    // Company exists — just update business type and proceed
    await supabase
      .from('companies')
      .update({ business_type: parsed.data.businessType })
      .eq('id', profile.company_id);
    revalidatePath('/', 'layout');
    redirect('/dashboard');
  }

  // Create company — user is authenticated, company_insert RLS policy allows this
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({
      company_name: parsed.data.companyName,
      business_type: parsed.data.businessType,
    })
    .select()
    .single();

  if (companyError) return { error: companyError.message };

  // Link profile to company; also save full_name from auth metadata if not set by trigger
  const fullName = profile?.full_name || (user.user_metadata?.full_name as string | undefined) || null;
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ company_id: company.id, full_name: fullName })
    .eq('id', user.id);

  if (profileError) return { error: profileError.message };

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
