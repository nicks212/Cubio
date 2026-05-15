'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Box, Globe } from 'lucide-react';

interface Props {
  contentKa: string;
  contentEn: string;
  labelKa: string;
  labelEn: string;
  title: string;
  subtitle: string;
  updatedAt: string | null;
  updatedLabel: string;
  backLabel: string;
  emptyLabel: string;
}

export default function TermsClient({
  contentKa,
  contentEn,
  labelKa,
  labelEn,
  title,
  subtitle,
  updatedAt,
  updatedLabel,
  backLabel,
  emptyLabel,
}: Props) {
  const [lang, setLang] = useState<'ka' | 'en'>('ka');
  const content = lang === 'ka' ? contentKa : contentEn;

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Box className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-semibold text-foreground">Cubio</span>
          </Link>

          {/* Language switcher */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <Globe className="w-4 h-4 text-muted-foreground ml-2" />
            <button
              onClick={() => setLang('ka')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                lang === 'ka' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {labelKa}
            </button>
            <button
              onClick={() => setLang('en')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                lang === 'en' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {labelEn}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
          {updatedAt && (
            <p className="text-xs text-muted-foreground mt-2">
              {updatedLabel}: {new Date(updatedAt).toLocaleDateString('ka-GE')}
            </p>
          )}
        </div>

        {content ? (
          <div
            className={[
              'prose-terms text-foreground leading-relaxed',
              '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-foreground',
              '[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-foreground',
              '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-foreground',
              '[&_p]:mb-4 [&_p]:leading-7 [&_p]:text-[0.95rem]',
              '[&_strong]:font-semibold [&_em]:italic [&_u]:underline',
            ].join(' ')}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <div className="py-20 text-center text-muted-foreground">
            {emptyLabel}
          </div>
        )}
      </main>

      {/* Footer back link */}
      <footer className="border-t border-slate-200 py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <Link href="/" className="text-sm text-primary hover:underline">
            ← {backLabel}
          </Link>
        </div>
      </footer>
    </div>
  );
}
