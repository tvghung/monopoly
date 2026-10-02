import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS,
  GRAPHICS_QUALITY_OPTIONS,
  SETTINGS_STORAGE_KEY,
  normalizeGraphicsQuality,
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

  it('defaults the graphics quality to auto and accepts only the four presets', () => {
    expect(DEFAULT_GAME_SETTINGS.graphicsQuality).toBe('auto');
    for (const option of GRAPHICS_QUALITY_OPTIONS) {
      expect(normalizeSettings({ graphicsQuality: option }).graphicsQuality).toBe(option);
    }
    for (const invalid of ['ultra', '', null, undefined, 2, {}, 'HIGH']) {
      expect(normalizeGraphicsQuality(invalid)).toBe('auto');
      expect(normalizeSettings({ graphicsQuality: invalid }).graphicsQuality).toBe('auto');
    }
  });

  it('upgrades settings saved before graphics quality existed', () => {
    const values = new Map<string, string>([[SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1, masterVolume: 0.5, musicVolume: 0.5, sfxVolume: 0.5, animationSpeed: 1.5, reducedMotion: true, fullscreen: false,
    })]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };

    expect(readGameSettings(storage)).toMatchObject({ graphicsQuality: 'auto', reducedMotion: true, animationSpeed: 1.5 });
  });
});
