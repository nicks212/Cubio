import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import LeadsClient from './LeadsClient';
import { getTranslations } from '@/lib/i18n';

export default async function LeadsPage() {
  const [t, supabase] = await Promise.all([getTranslations(), createClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id, company:companies(business_type)')
    .eq('id', user.id)
    .single();

  // Leads are not relevant for salons (they use reservations). Block direct access.
  const businessType = (profile?.company as { business_type?: string } | null)?.business_type;
  if (businessType === 'beauty_salon') redirect('/dashboard');

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('company_id', profile?.company_id ?? '')
    .order('created_at', { ascending: false });

  return <LeadsClient leads={leads ?? []} t={t} />;
}
