import { createClient } from '@/lib/supabase/server';
import ApartmentsClient from './ApartmentsClient';

export default async function ApartmentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = profile?.company_id ?? '';

  const [{ data: apartments }, { data: projects }, { data: templates }] = await Promise.all([
    supabase.from('apartments').select('*, project:projects(name)').eq('company_id', companyId).is('deleted_at', null).order('floor').order('apartment_number'),
    supabase.from('projects').select('id, name, total_floors').eq('company_id', companyId).order('name'),
    supabase.from('apartment_templates').select('*').eq('company_id', companyId).order('name'),
  ]);

  return (
    <ApartmentsClient
      apartments={apartments ?? []}
      projects={projects ?? []}
      templates={templates ?? []}
      companyId={companyId}
    />
  );
}
