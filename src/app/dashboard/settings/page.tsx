import { createClient } from '@/lib/supabase/server';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles')
    .select('*, company:companies(*)').eq('id', user.id).single();

  return (
    <SettingsClient
      profile={profile}
      company={profile?.company ?? null}
      email={user.email ?? ''}
    />
  );
}
