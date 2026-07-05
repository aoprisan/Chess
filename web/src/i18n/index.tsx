// Lightweight i18n for Neon City. English is the source of truth; Romanian
// (`ro`) is a full override with English fallback for any missing key. The
// chosen language lives in a single localStorage key and is exposed through a
// React context so every screen re-renders on a language switch.
//
// Usage in components:
//   const t = useT();                 // t('menu.campaign')
//   const { lang, setLang } = useLang();
// Outside React (pure helpers), pass `lang` explicitly to the game helpers.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { UI } from './uiStrings';

export type Lang = 'en' | 'ro';

export const LANGS: readonly Lang[] = ['en', 'ro'];

const LANG_KEY = 'neon_lang_v1';

export function loadLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'en' || stored === 'ro') return stored;
  } catch {
    // localStorage unavailable (private mode etc.) — fall back to English.
  }
  return 'en';
}

function saveLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Persisting is best-effort.
  }
}

/** Fill `{name}` placeholders in a template from a params object. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}

/** Pure translation lookup with English fallback and placeholder filling. */
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const entry = UI[key];
  if (!entry) return key; // surface missing keys instead of rendering blanks
  return interpolate(entry[lang] ?? entry.en, params);
}

export type TFn = (key: string, params?: Record<string, string | number>) => string;

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    saveLang(next);
  }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang(): LanguageContextValue {
  return useContext(LanguageContext);
}

/** Hook returning a bound `t(key, params)` for the current language. */
export function useT(): TFn {
  const { lang } = useLang();
  return useCallback((key: string, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);
}

export * from './gameStrings';
