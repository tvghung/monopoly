import { useEffect } from 'react';
import { useSettings } from '../settings/selectors';
import { translate } from './I18n';

export function LanguageDocumentSync() {
  const { settings } = useSettings();
  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.title = translate('document.title', settings.language);
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = translate('document.description', settings.language);
  }, [settings.language]);
  return null;
}
