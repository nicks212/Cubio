import type { Metadata } from 'next';
import './globals.css';
import { cookies } from 'next/headers';
import { TranslationsProvider } from '@/components/TranslationsProvider';
import { getTranslations } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Cubio – AI-Powered Business Automation',
  description: 'Multi-tenant AI business communication platform. Connect your channels and automate customer conversations.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const lang = cookieStore.get('cubio_lang')?.value === 'en' ? 'en' : 'ka';
  const translations = await getTranslations(lang);
  return (
    <html lang={lang} dir="ltr">
      <body>
        <TranslationsProvider translations={translations}>
          {children}
        </TranslationsProvider>
      </body>
    </html>
  );
}
