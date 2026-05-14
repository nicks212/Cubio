'use client';

import { createContext, useContext } from 'react';
import type { T } from '@/lib/i18n';

const TranslationsContext = createContext<T>({});

export function TranslationsProvider({
  translations,
  children,
}: {
  translations: T;
  children: React.ReactNode;
}) {
  return (
    <TranslationsContext.Provider value={translations}>
      {children}
    </TranslationsContext.Provider>
  );
}

export type TFunc = ((key: string) => string) & T;

export function useT(): TFunc {
  const translations = useContext(TranslationsContext);
  const fn = (key: string) => translations[key] ?? key;
  return Object.assign(fn, translations) as TFunc;
}
