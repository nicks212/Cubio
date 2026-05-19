import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardLayoutClient from './DashboardLayoutClient';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, company:companies(*)')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/onboarding');

  // Force onboarding if business type not set
  if (!profile.company?.business_type) redirect('/onboarding');

  const companyId = profile.company_id ?? '';

  // Fetch live counts for nav badges
  const [{ count: openLeads }, { count: openEscalations }] = await Promise.all([
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('status', ['new', 'contacted', 'scheduled']),
    supabase
      .from('escalations')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'open'),
  ]);

  const cookieStore = await cookies();
  const lang = cookieStore.get('cubio_lang')?.value === 'en' ? 'en' : 'ka';

  return (
    <DashboardLayoutClient
      profile={profile}
      leadsCount={openLeads ?? 0}
      escalationsCount={openEscalations ?? 0}
      currentLang={lang}
    >
      {children}
    </DashboardLayoutClient>
  );
}
