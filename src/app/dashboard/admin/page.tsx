import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { DEFAULT_TRANSLATIONS } from '@/lib/i18n';
import AdminClient from './AdminClient';

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: selfProfile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!selfProfile?.is_admin) redirect('/dashboard');

  const adminClient = createAdminClient();

  const [{ data: users }, { data: dbLocalizations }, { data: integrations }, { data: companies }] = await Promise.all([
    adminClient.from('profiles').select('*, company:companies(company_name, business_type)').order('created_at', { ascending: false }),
    adminClient.from('localizations').select('*').order('keyword'),
    adminClient.from('integrations').select('*, company:companies(company_name)').order('created_at', { ascending: false }),
    adminClient.from('companies').select('id, company_name').order('company_name'),
  ]);

  // Merge all default keys with DB overrides so every key is visible and editable
  const dbMap = new Map((dbLocalizations ?? []).map(l => [l.keyword, l]));
  const allLocalizations = Object.entries(DEFAULT_TRANSLATIONS)
    .map(([keyword, defaultText]) => {
      const db = dbMap.get(keyword);
      return { id: db?.id ?? null as string | null, keyword, localization_text: db?.localization_text ?? defaultText };
    })
    .sort((a, b) => a.keyword.localeCompare(b.keyword));

  return (
    <AdminClient
      users={users ?? []}
      localizations={allLocalizations}
      integrations={integrations ?? []}
      companies={companies ?? []}
    />
  );
}
