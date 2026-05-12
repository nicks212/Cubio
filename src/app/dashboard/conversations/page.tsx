import { createClient } from '@/lib/supabase/server';
import ConversationsClient from './ConversationsClient';

export default async function ConversationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('company_id').eq('id', user.id).single();
  const companyId = profile?.company_id ?? '';

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false });

  return <ConversationsClient conversations={conversations ?? []} companyId={companyId} />;
}
