import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS } from '../settings/defaults';
import { SettingsProvider } from '../settings/SettingsProvider';
import { useSettings } from '../settings/selectors';
import { LanguageDocumentSync } from './LanguageDocumentSync';

let createdDescription = false;

beforeEach(() => {
  createdDescription = false;
  if (!document.querySelector('meta[name="description"]')) {
    const description = document.createElement('meta');
    description.name = 'description';
    document.head.append(description);
    createdDescription = true;
  }
});

afterEach(() => {
  cleanup();
  document.documentElement.lang = 'vi';
  if (createdDescription) document.querySelector('meta[name="description"]')?.remove();
});

function LanguageToggle({ onReady }: { onReady: (set: (language: 'vi' | 'en') => void) => void }) {
  const { updateSettings } = useSettings();
  onReady(language => updateSettings({ language }));
  return null;
}

describe('LanguageDocumentSync', () => {
  it('sets the document language from the persisted preference and follows changes', () => {
    let setLanguage: (language: 'vi' | 'en') => void = () => {};
    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, language: 'en' }}>
        <LanguageDocumentSync />
        <LanguageToggle onReady={setter => { setLanguage = setter; }} />
      </SettingsProvider>,
    );
    expect(document.documentElement.lang).toBe('en');
    expect(document.title).toBe('OWN THE BLOCK — Vietnam Edition');
    expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toContain('real-time online multiplayer');

    act(() => setLanguage('vi'));
    expect(document.documentElement.lang).toBe('vi');
    expect(document.title).toBe('OWN THE BLOCK — Phiên bản Việt Nam');
    act(() => setLanguage('en'));
    expect(document.documentElement.lang).toBe('en');
  });
});
