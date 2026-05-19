'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const LANGS = {
  ka: { flag: '🇬🇪', label: 'KA' },
  en: { flag: '🇬🇧', label: 'EN' },
} as const;

interface Props {
  currentLang: 'ka' | 'en';
}

export function LanguageSwitcher({ currentLang }: Props) {
  const router = useRouter();
  const [displayed, setDisplayed] = useState<'ka' | 'en'>(currentLang);
  const [flipping, setFlipping] = useState(false);
  const [loading, setLoading] = useState(false);

  // When server re-renders with the new lang, the prop changes — loading done
  useEffect(() => {
    setLoading(false);
    setDisplayed(currentLang);
  }, [currentLang]);

  const toggle = () => {
    if (flipping || loading) return;
    const next: 'ka' | 'en' = displayed === 'ka' ? 'en' : 'ka';

    // Set cookie and fire refresh IMMEDIATELY so server work starts now
    document.cookie = `cubio_lang=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setLoading(true);
    router.refresh();

    // Run the flip animation concurrently
    setFlipping(true);
    setTimeout(() => setDisplayed(next), 190);
    setTimeout(() => setFlipping(false), 380);
  };

  const { flag, label } = LANGS[displayed];

  return (
    <>
      {loading && (
        <div className="lang-overlay fixed inset-0 z-[9999] bg-white/70 backdrop-blur-[2px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-9 h-9 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <span className="text-sm font-medium text-muted-foreground">
              {LANGS[next(displayed)].flag}
            </span>
          </div>
        </div>
      )}
      <button
        onClick={toggle}
        disabled={flipping || loading}
        className="flex items-center gap-1.5 px-3 py-2 text-foreground hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium disabled:cursor-default select-none"
        aria-label={`Language: ${label}. Click to switch.`}
      >
        <span className={`flex items-center gap-1.5${flipping ? ' lang-flip' : ''}`}>
          <span className="text-base leading-none">{flag}</span>
          <span className="text-xs text-muted-foreground uppercase font-semibold">{label}</span>
        </span>
      </button>
    </>
  );
}

function next(lang: 'ka' | 'en'): 'ka' | 'en' {
  return lang === 'ka' ? 'en' : 'ka';
}
