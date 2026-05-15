import { createAdminClient } from '@/lib/supabase/server';
import { getTranslations } from '@/lib/i18n';
import TermsClient from './TermsClient';

export const dynamic = 'force-dynamic';

export default async function TermsPage() {
  const [t, adminSupabase] = [await getTranslations(), createAdminClient()];

  const { data: rows } = await adminSupabase
    .from('terms_content')
    .select('language, content, updated_at');

  const ka = rows?.find(r => r.language === 'ka');
  const en = rows?.find(r => r.language === 'en');

  // Most recent update timestamp
  const updatedAt =
    ka?.updated_at && en?.updated_at
      ? new Date(ka.updated_at) > new Date(en.updated_at)
        ? ka.updated_at
        : en.updated_at
      : (ka?.updated_at ?? en?.updated_at ?? null);

  return (
    <TermsClient
      contentKa={ka?.content ?? ''}
      contentEn={en?.content ?? ''}
      labelKa={t['terms.lang_ka']}
      labelEn={t['terms.lang_en']}
      title={t['terms.title']}
      subtitle={t['terms.subtitle']}
      updatedAt={updatedAt}
      updatedLabel={t['terms.last_updated']}
      backLabel={t['terms.back']}
      emptyLabel={t['terms.empty']}
    />
  );
}
