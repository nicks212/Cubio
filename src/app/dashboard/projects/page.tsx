import { createClient } from '@/lib/supabase/server';
import ProjectsClient from './ProjectsClient';

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('company_id', profile?.company_id ?? '')
    .order('created_at', { ascending: false });

  return <ProjectsClient projects={projects ?? []} />;
}
