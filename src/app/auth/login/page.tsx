import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginContent } from './LoginContent';

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();
    redirect(profile?.company_id ? '/dashboard' : '/onboarding');
  }

  return <LoginContent />;
}
