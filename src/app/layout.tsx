import type { Metadata } from 'next';
import './globals.css';
import { TranslationsProvider } from '@/components/TranslationsProvider';
import { getTranslations } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Cubio – AI-Powered Business Automation',
  description: 'Multi-tenant AI business communication platform. Connect your channels and automate customer conversations.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const translations = await getTranslations();
  return (
    <html lang="ka">
      <body>
        <TranslationsProvider translations={translations}>
          {children}
        </TranslationsProvider>
      </body>
    </html>
  );
}
