import type { MessageKey } from './catalog';

/**
 * The one list of languages the game ships. The language selector of the main menu, the language field of the Settings
 * dialog, the stored-preference check (`normalizeSettings`) and the `Language` type all read it, so a language that is not
 * listed here is neither offered nor accepted from storage. Order is the order of the selector.
 *
 * To add a language: add its code here with a `labelKey` whose text is the language's own name (an endonym, the same in every
 * catalog), give `catalog.ts` a full set of messages for it and register that catalog in `I18n.tsx` (`CATALOGS`), and extend
 * the data that is localized by field rather than by message key (`LANDMARK_PLAN` names, card copy, character names). Code that
 * still branches on `language === 'en'` has to learn the new code too (`grep "'en'"`).
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'vi', labelKey: 'language.vietnamese' },
  { code: 'en', labelKey: 'language.english' },
] as const satisfies ReadonlyArray<{ code: string; labelKey: MessageKey }>;

export type Language = typeof SUPPORTED_LANGUAGES[number]['code'];

export const DEFAULT_LANGUAGE: Language = 'vi';

export function isSupportedLanguage(value: unknown): value is Language {
  return SUPPORTED_LANGUAGES.some(language => language.code === value);
}
