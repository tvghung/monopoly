import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Languages } from 'lucide-react';
import { useTranslation, type Language } from '../i18n/I18n';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import './style/LanguageSelector.css';

interface LanguageSelectorProps {
  value: Language;
  onChange: (language: Language) => void;
  className?: string;
}

/**
 * The language picker of the main menu: a button that names the current language and opens a small list of every language in
 * `SUPPORTED_LANGUAGES`. Opening the list changes nothing; the language changes when an option is chosen, and the list then
 * closes and returns focus to the button. It also closes on Escape, on a press outside and when focus leaves it.
 *
 * Keyboard: Enter, Space or an arrow opens it on the current language; Up, Down, Home and End move; Enter or Space chooses.
 * The options are real buttons (`role="option"`), so touch and mouse work the same way.
 */
export default function LanguageSelector({ value, onChange, className = '' }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'up' | 'down'>('up');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const titleId = useId();
  const currentName = t(SUPPORTED_LANGUAGES.find(language => language.code === value)?.labelKey ?? 'language.vietnamese');

  const options = () => [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];

  const openList = () => {
    // The list opens toward the side with more room: the menu sits low in the window, so that is usually upward.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPlacement(rect.top > window.innerHeight / 2 ? 'up' : 'down');
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  // The current language takes focus when the list opens, so the keyboard starts where the player is.
  useEffect(() => {
    if (!open) return;
    (options().find(option => option.getAttribute('aria-selected') === 'true') ?? options()[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (language: Language) => {
    close(true);
    if (language !== value) onChange(language);
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openList();
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // Only the list: Escape must not also leave a screen or close a dialog that is behind it.
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const items = options();
    const index = items.findIndex(item => item === document.activeElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next === -1) return;
    event.preventDefault();
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className={`language-selector${className ? ` ${className}` : ''}`} data-placement={placement}>
      <button
        ref={triggerRef}
        type="button"
        className="ds-button ds-button--ghost ds-button--md language-selector__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={t('language.triggerLabel', { language: currentName })}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onTriggerKeyDown}
      >
        <Languages className="language-selector__icon" aria-hidden="true" />
        <span className="language-selector__current">{currentName}</span>
        <ChevronDown className="language-selector__chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="language-selector__popover" onKeyDown={onListKeyDown}>
          <p id={titleId} className="language-selector__title">{t('language.select')}</p>
          <div id={listId} className="language-selector__list" role="listbox" aria-labelledby={titleId}>
            {SUPPORTED_LANGUAGES.map(({ code, labelKey }) => (
              <button
                key={code}
                type="button"
                role="option"
                lang={code}
                aria-selected={code === value}
                className="language-selector__option"
                onClick={() => choose(code)}
              >
                <span className="language-selector__check" aria-hidden="true">{code === value ? <Check /> : null}</span>
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
