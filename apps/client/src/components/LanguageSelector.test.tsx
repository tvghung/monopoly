import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LanguageSelector from './LanguageSelector';
import SettingsPanel from '../settings/SettingsPanel';
import { DEFAULT_GAME_SETTINGS, SETTINGS_STORAGE_KEY } from '../settings/defaults';
import { SettingsProvider } from '../settings/SettingsProvider';
import { useSettings } from '../settings/selectors';
import { I18nProvider, useTranslation, type Language } from '../i18n/I18n';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** The selector over the real settings and i18n providers, the way the main menu has it. */
function Harness({ initial = 'vi', onChange }: { initial?: Language; onChange?: (language: Language) => void }) {
  return (
    <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, language: initial }}>
      <I18nProvider>
        <Selector onChange={onChange} />
      </I18nProvider>
    </SettingsProvider>
  );
}

function Selector({ onChange }: { onChange?: (language: Language) => void }) {
  const { settings, updateSettings } = useSettings();
  return (
    <LanguageSelector
      value={settings.language}
      onChange={next => {
        onChange?.(next);
        updateSettings({ language: next });
      }}
    />
  );
}

const trigger = (name: string) => screen.getByRole('button', { name });

describe('LanguageSelector', () => {
  it('shows the current language on its button and opens a list without changing anything', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const button = trigger('Ngôn ngữ: Tiếng Việt');
    expect(button.textContent).toBe('Tiếng Việt');
    expect(button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox', { name: 'Chọn ngôn ngữ' })).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    expect(button.textContent).toBe('Tiếng Việt');
  });

  it('lists exactly the supported languages, marks the current one, and puts focus on it', async () => {
    render(<Harness initial="en" />);

    fireEvent.click(trigger('Language: English'));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual(['Tiếng Việt', 'English']);
    expect(options).toHaveLength(SUPPORTED_LANGUAGES.length);
    expect(options.map(option => option.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    await waitFor(() => expect(document.activeElement).toBe(options[1]));
  });

  it('changes the language only when an option is chosen, then closes and returns focus to the button', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(trigger('Ngôn ngữ: Tiếng Việt'));
    fireEvent.click(screen.getByRole('option', { name: 'English' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('en');
    expect(screen.queryByRole('listbox')).toBeNull();
    const button = trigger('Language: English');
    expect(button.textContent).toBe('English');
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it('closes without a change when the current language is chosen again', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(trigger('Ngôn ngữ: Tiếng Việt'));
    fireEvent.click(screen.getByRole('option', { name: 'Tiếng Việt' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape and on a press outside, and changes nothing either way', async () => {
    const onChange = vi.fn();
    render(<><Harness onChange={onChange} /><p>outside</p></>);

    fireEvent.click(trigger('Ngôn ngữ: Tiếng Việt'));
    fireEvent.keyDown(screen.getByRole('option', { name: 'Tiếng Việt' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger('Ngôn ngữ: Tiếng Việt')));

    fireEvent.click(trigger('Ngôn ngữ: Tiếng Việt'));
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.pointerDown(screen.getByText('outside'));
    expect(screen.queryByRole('listbox')).toBeNull();

    // A press inside the list is not an outside press.
    fireEvent.click(trigger('Ngôn ngữ: Tiếng Việt'));
    fireEvent.pointerDown(screen.getByRole('option', { name: 'English' }));
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works from the keyboard: an arrow opens it, arrows move, Enter chooses', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const button = trigger('Ngôn ngữ: Tiếng Việt');
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    const vietnamese = await screen.findByRole('option', { name: 'Tiếng Việt' });
    await waitFor(() => expect(document.activeElement).toBe(vietnamese));

    fireEvent.keyDown(vietnamese, { key: 'ArrowDown' });
    const english = screen.getByRole('option', { name: 'English' });
    expect(document.activeElement).toBe(english);
    fireEvent.keyDown(english, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(vietnamese);
    fireEvent.keyDown(vietnamese, { key: 'End' });
    expect(document.activeElement).toBe(english);

    // Enter on a focused button is a click.
    fireEvent.click(english);
    expect(onChange).toHaveBeenCalledExactlyOnceWith('en');
  });

  it('closes when Tab leaves the list', () => {
    render(<Harness />);

    fireEvent.click(trigger('Ngôn ngữ: Tiếng Việt'));
    fireEvent.keyDown(screen.getByRole('option', { name: 'Tiếng Việt' }), { key: 'Tab' });

    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

function Probe() {
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();
  return (
    <>
      <LanguageSelector value={settings.language} onChange={language => updateSettings({ language })} />
      <p data-testid="greeting">{t('launcher.host')}</p>
    </>
  );
}

describe('LanguageSelector with the settings', () => {
  it('writes the choice to the stored settings and the whole interface follows at once', async () => {
    render(<SettingsProvider><I18nProvider><Probe /></I18nProvider></SettingsProvider>);
    expect(screen.getByTestId('greeting').textContent).toBe('Tạo phòng');

    fireEvent.click(trigger('Ngôn ngữ: Tiếng Việt'));
    expect(screen.getByTestId('greeting').textContent).toBe('Tạo phòng');
    fireEvent.click(screen.getByRole('option', { name: 'English' }));

    expect(screen.getByTestId('greeting').textContent).toBe('Host Room');
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({ language: 'en' }));
  });

  it('starts from the stored language, and the Settings dialog shows the same one', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 2, language: 'en' }));
    render(
      <SettingsProvider>
        <I18nProvider>
          <Probe />
          <SettingsPanel open onClose={() => undefined} />
        </I18nProvider>
      </SettingsProvider>,
    );

    expect(trigger('Language: English').textContent).toBe('English');
    const dialog = screen.getByRole('dialog');
    const selected = within(dialog).getAllByRole('radio').filter(radio => radio.getAttribute('aria-checked') === 'true' || (radio as HTMLInputElement).checked);
    expect(selected.map(radio => radio.getAttribute('aria-label') ?? radio.textContent)).toContain('English');
  });

  it('ignores a stored language the game does not ship', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ version: 2, language: 'fr' }));
    render(<SettingsProvider><I18nProvider><Probe /></I18nProvider></SettingsProvider>);

    expect(trigger('Ngôn ngữ: Tiếng Việt')).toBeTruthy();
  });
});
