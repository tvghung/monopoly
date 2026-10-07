import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSettings } from '../settings/selectors';
import { en, vi, type MessageKey } from './catalog';

export type Language = 'vi' | 'en';
export type MessageValues = Readonly<Record<string, string | number>>;

export function formatMessage(template: string, values: MessageValues = {}): string {
  return template.replace(/\{([^}]+)\}/gu, (_match, name: string) => String(values[name] ?? `{${name}}`));
}

export function translate(key: MessageKey, language: Language, values?: MessageValues): string {
  return formatMessage(language === 'en' ? en[key] : vi[key], values);
}

interface I18nValue {
  language: Language;
  t: (key: MessageKey, values?: MessageValues) => string;
}

const defaultI18n: I18nValue = { language: 'vi', t: (key, values) => translate(key, 'vi', values) };
const I18nContext = createContext<I18nValue>(defaultI18n);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const language = settings.language;
  const value = useMemo<I18nValue>(() => ({
    language,
    t: (key, values) => translate(key, language, values),
  }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nValue {
  return useContext(I18nContext);
}

export { en, vi };
