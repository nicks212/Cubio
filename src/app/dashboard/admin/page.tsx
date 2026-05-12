import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: selfProfile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!selfProfile?.is_admin) redirect('/dashboard');

  const adminClient = createAdminClient();

  const [{ data: users }, { data: integrations }, { data: localizations }, { data: companies }] = await Promise.all([
    adminClient.from('profiles').select('*, company:companies(company_name, business_type)').order('created_at', { ascending: false }),
    adminClient.from('integrations').select('*, company:companies(company_name)').order('created_at', { ascending: false }),
    adminClient.from('localizations').select('*').order('keyword'),
    adminClient.from('companies').select('id, company_name').order('company_name'),
  ]);

  return (
    <AdminClient
      users={users ?? []}
      integrations={integrations ?? []}
      localizations={localizations ?? []}
      companies={companies ?? []}
    />
  );
}
