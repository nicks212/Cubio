'use client';

import { useState, useRef, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';

const LANGUAGES = [
  { code: 'ka' as const, label: 'ქართული', flag: '🇬🇪' },
  { code: 'en' as const, label: 'English', flag: '🇬🇧' },
];

interface Props {
  currentLang: 'ka' | 'en';
}

export function LanguageSwitcher({ currentLang }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const setLang = (lang: 'ka' | 'en') => {
    document.cookie = `cubio_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    setOpen(false);
    router.refresh();
  };

  const current = LANGUAGES.find(l => l.code === currentLang) ?? LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2 text-foreground hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
        aria-label="Change language"
      >
        <Globe className="w-4 h-4 text-muted-foreground" />
        <span>{current.flag}</span>
        <span className="text-xs text-muted-foreground uppercase">{current.code}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50 min-w-[150px]">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => setLang(lang.code)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-slate-50 transition-colors ${
                currentLang === lang.code ? 'bg-primary/5 text-primary font-medium' : 'text-foreground'
              }`}
            >
              <span className="text-base">{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
