import { createClient } from '@/lib/supabase/server';
import IntegrationsClient from './IntegrationsClient';

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  const { data: integrations } = await supabase
    .from('integrations')
    .select('provider, account_name, provider_account_id, is_active')
    .eq('company_id', profile?.company_id ?? '');

  return <IntegrationsClient integrations={integrations ?? []} />;
}

