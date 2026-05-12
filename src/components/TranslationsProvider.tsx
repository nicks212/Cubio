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

export function useT(): T {
  return useContext(TranslationsContext);
}
