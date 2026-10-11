import { Languages } from 'lucide-react';
import { useTranslation, type Language } from '../i18n/I18n';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import DropdownSelector from './DropdownSelector';

interface LanguageSelectorProps {
  value: Language;
  onChange: (language: Language) => void;
  className?: string;
}

/** The shared dropdown design configured with the supported language choices. */
export default function LanguageSelector({ value, onChange, className = '' }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const currentName = t(SUPPORTED_LANGUAGES.find(language => language.code === value)?.labelKey ?? 'language.vietnamese');

  return (
    <DropdownSelector
      value={value}
      options={SUPPORTED_LANGUAGES.map(({ code, labelKey }) => ({ value: code, label: t(labelKey), lang: code }))}
      onChange={onChange}
      heading={t('language.select')}
      triggerLabel={t('language.triggerLabel', { language: currentName })}
      icon={<Languages />}
      className={className}
    />
  );
}
