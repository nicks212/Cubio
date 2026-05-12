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

  if (!profile) redirect('/auth/login');

  // Force onboarding if business type not set
  if (!profile.company?.business_type) redirect('/onboarding');

  return (
    <DashboardLayoutClient profile={profile}>
      {children}
    </DashboardLayoutClient>
  );
}
