import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ServicesClient from './ServicesClient';

export default async function ServicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, company:companies(business_type)')
    .eq('id', user.id)
    .single();

  // Only the beauty_salon profile uses services. Other profiles → dashboard.
  const businessType = (profile?.company as { business_type?: string } | null)?.business_type;
  if (businessType !== 'beauty_salon') redirect('/dashboard');

  const companyId = profile?.company_id ?? '';

  const [{ data: services }, { data: specialistTypes }] = await Promise.all([
    supabase.from('services').select('*').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('specialist_types').select('id, name').eq('company_id', companyId).is('deleted_at', null).order('name'),
  ]);

  return (
    <ServicesClient
      services={services ?? []}
      specialistTypes={specialistTypes ?? []}
    />
  );
}
