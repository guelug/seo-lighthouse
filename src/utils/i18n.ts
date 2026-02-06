/*
  i18n system - disabled
  Raycast currently only supports US English and does not support localization.
  This file is kept for future reference if localization support is added.

  To re-enable, uncomment this file and update imports in seo-lighthouse.tsx:
  import { t } from './utils/i18n';

  Then replace English strings with t() calls.
*/

/*
import { environment, getPreferenceValues } from '@raycast/api';

type Lang = 'en' | 'es' | 'ca' | 'de' | 'fr' | 'nl' | 'tr';
type Translations = Record<string, Partial<Record<Lang, string>>>;

const translations: Translations = {
  // ... (all translations preserved)
};

const supportedLanguages: Lang[] = ['en', 'es', 'ca', 'de', 'fr', 'nl', 'tr'];

export function t(key: string): string {
  const prefs = getPreferenceValues<{ language: string }>();
  const sysLang = (environment as any)?.language
    ?.split('-')?.[0]
    ?.toLowerCase() as Lang | undefined;
  const prefLang = prefs.language as Lang | 'auto' | undefined;

  let lang: Lang = 'en';
  if (
    prefLang &&
    prefLang !== 'auto' &&
    supportedLanguages.includes(prefLang as Lang)
  ) {
    lang = prefLang as Lang;
  } else if (sysLang && supportedLanguages.includes(sysLang)) {
    lang = sysLang;
  }

  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] || entry['en'] || Object.values(entry)[0] || key;
}
*/
