import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import CalendarClient from './CalendarClient';

export default async function CalendarPage() {
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

  const [{ data: reservations }, { data: services }, { data: specialists }] = await Promise.all([
    supabase
      .from('reservations')
      .select('id, customer_name, customer_phone, service_id, specialist_id, reservation_date, reservation_start_time, reservation_end_time, status, source, notes, pet_name, animal_type, breed, size_category, special_requirements')
      .eq('company_id', companyId)
      .order('reservation_date', { ascending: true })
      .order('reservation_start_time', { ascending: true }),
    supabase.from('services').select('id, service_name, duration_minutes, specialist_type_id').eq('company_id', companyId).eq('active', true).is('deleted_at', null).order('service_name'),
    supabase.from('specialists').select('id, specialist_name, specialist_type_id').eq('company_id', companyId).eq('active', true).is('deleted_at', null).order('specialist_name'),
  ]);

  return (
    <CalendarClient
      reservations={reservations ?? []}
      services={services ?? []}
      specialists={specialists ?? []}
    />
  );
}
