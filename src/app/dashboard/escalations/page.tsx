import { createClient } from '@/lib/supabase/server';
import EscalationsClient from './EscalationsClient';
import { getTranslations } from '@/lib/i18n';

export default async function EscalationsPage() {
  const [t, supabase] = await Promise.all([getTranslations(), createClient()]);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  const { data: escalations } = await supabase
    .from('escalations')
    .select('*')
    .eq('company_id', profile?.company_id ?? '')
    .order('created_at', { ascending: false });

  return <EscalationsClient escalations={escalations ?? []} t={t} />;
}
