import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS,
  SETTINGS_STORAGE_KEY,
  normalizeSettings,
} from './defaults';
import { readGameSettings, writeGameSettings } from './storage';

describe('game settings', () => {
  it('normalizes malformed and out-of-range values defensively', () => {
    expect(normalizeSettings({
      masterVolume: 2,
      musicVolume: -1,
      sfxVolume: 'loud',
      animationSpeed: 3,
      reducedMotion: true,
      fullscreen: true,
    })).toEqual({
      ...DEFAULT_GAME_SETTINGS,
      masterVolume: 1,
      musicVolume: 0,
      reducedMotion: true,
      fullscreen: true,
    });
  });

  it('persists only under the versioned settings key and recovers from bad storage', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(writeGameSettings({ ...DEFAULT_GAME_SETTINGS, reducedMotion: true }, storage)).toBe(true);
    expect(values.has(SETTINGS_STORAGE_KEY)).toBe(true);
    expect(readGameSettings(storage).reducedMotion).toBe(true);
    values.set(SETTINGS_STORAGE_KEY, '{bad json');
    expect(readGameSettings(storage)).toEqual(DEFAULT_GAME_SETTINGS);
  });
});
