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

  // Sync with server-side prop after router.refresh() resolves
  useEffect(() => {
    setDisplayed(currentLang);
  }, [currentLang]);

  const toggle = () => {
    if (flipping) return;
    const next: 'ka' | 'en' = displayed === 'ka' ? 'en' : 'ka';
    setFlipping(true);
    document.cookie = `cubio_lang=${next}; path=/; max-age=31536000; SameSite=Lax`;
    // Swap visible content at animation midpoint (190ms into 380ms)
    setTimeout(() => setDisplayed(next), 190);
    // End animation then trigger server re-render with new lang
    setTimeout(() => {
      setFlipping(false);
      router.refresh();
    }, 380);
  };

  const { flag, label } = LANGS[displayed];

  return (
    <button
      onClick={toggle}
      disabled={flipping}
      className="flex items-center gap-1.5 px-3 py-2 text-foreground hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium disabled:cursor-default select-none"
      aria-label={`Language: ${label}. Click to switch.`}
    >
      <span className={`flex items-center gap-1.5${flipping ? ' lang-flip' : ''}`}>
        <span className="text-base leading-none">{flag}</span>
        <span className="text-xs text-muted-foreground uppercase font-semibold">{label}</span>
      </span>
    </button>
  );
}
