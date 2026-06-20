import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SpecialistsClient from './SpecialistsClient';

export default async function SpecialistsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, company:companies(business_type)')
    .eq('id', user.id)
    .single();

  const businessType = (profile?.company as { business_type?: string } | null)?.business_type;
  if (businessType !== 'beauty_salon') redirect('/dashboard');

  const companyId = profile?.company_id ?? '';

  const [{ data: specialists }, { data: specialistTypes }, { data: categories }, { data: schedules }, { data: vacations }] = await Promise.all([
    supabase.from('specialists').select('*, specialist_type:specialist_types(name)').eq('company_id', companyId).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('specialist_types').select('id, name').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('service_categories').select('id, name').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('specialist_schedules').select('id, specialist_id, weekday, start_time, end_time').eq('company_id', companyId),
    supabase.from('specialist_vacations').select('id, specialist_id, start_date, end_date, label').eq('company_id', companyId).order('start_date'),
  ]);

  return (
    <SpecialistsClient
      specialists={specialists ?? []}
      specialistTypes={specialistTypes ?? []}
      categories={categories ?? []}
      schedules={schedules ?? []}
      vacations={vacations ?? []}
    />
  );
}
