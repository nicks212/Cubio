import { createAdminClient } from '@/lib/supabase/server';
import OnboardingClient from './OnboardingClient';

export default async function OnboardingPage() {
  const adminSupabase = createAdminClient();
  const { data: rows } = await adminSupabase
    .from('terms_content')
    .select('language, content');

  const ka = rows?.find(r => r.language === 'ka')?.content ?? '';
  const en = rows?.find(r => r.language === 'en')?.content ?? '';

  return <OnboardingClient termsKa={ka} termsEn={en} />;
}
