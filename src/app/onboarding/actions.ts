'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BusinessType } from '@/types/database';

export async function selectBusinessType(businessType: BusinessType) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  // Get user profile to find company
  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (!profile?.company_id) redirect('/auth/login');

  await supabase
    .from('companies')
    .update({ business_type: businessType })
    .eq('id', profile.company_id);

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
