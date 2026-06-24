import type { Metadata, Viewport } from 'next';
import './globals.css';
import { cookies } from 'next/headers';
import { TranslationsProvider } from '@/components/TranslationsProvider';
import { getTranslations } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Cubio – AI-Powered Business Automation',
  description: 'Multi-tenant AI business communication platform. Connect your channels and automate customer conversations.',
};

// viewport-fit=cover makes env(safe-area-inset-*) resolve to real values on
// notched / home-indicator devices — required so the fixed mobile bottom nav
// isn't clipped by the home indicator or browser chrome.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
