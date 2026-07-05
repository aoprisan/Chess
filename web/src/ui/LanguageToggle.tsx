import { LANGS, useLang, useT } from '../i18n';
import type { Lang } from '../i18n';

const LABEL_KEY: Record<Lang, string> = {
  en: 'lang.english',
  ro: 'lang.romanian',
};

// Compact English/Romanian switch shown on the home screen. Persists through
// the language context (single localStorage key), so the whole app reflows.
export function LanguageToggle() {
  const { lang, setLang } = useLang();
  const t = useT();
  return (
    <div className="lang-toggle" role="radiogroup" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          className={`lang-chip${lang === l ? ' active' : ''}`}
          role="radio"
          aria-checked={lang === l}
          onClick={() => setLang(l)}
        >
          {t(LABEL_KEY[l])}
        </button>
      ))}
    </div>
  );
}
