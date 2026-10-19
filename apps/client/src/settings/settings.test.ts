import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_SETTINGS,
  FPS_LIMIT_OPTIONS,
  GRAPHICS_QUALITY_OPTIONS,
  LEGACY_SETTINGS_STORAGE_KEY,
  PREVIOUS_SETTINGS_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  normalizeGraphicsQuality,
  normalizeFpsLimit,
  normalizeSettings,
} from './defaults';
import { readGameSettings, writeGameSettings } from './storage';

describe('game settings', () => {
  it('starts a fresh profile at balanced and migrates old Auto once without changing saved manual tiers', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(readGameSettings(storage).graphicsQuality).toBe('balanced');
    for (const tier of ['auto', 'low', 'balanced', 'high'] as const) {
      values.delete(SETTINGS_STORAGE_KEY);
      values.set(PREVIOUS_SETTINGS_STORAGE_KEY, JSON.stringify({ ...DEFAULT_GAME_SETTINGS, version: 2, graphicsQuality: tier }));
      expect(readGameSettings(storage).graphicsQuality).toBe(tier === 'auto' ? 'balanced' : tier);
    }
    expect(writeGameSettings({ ...DEFAULT_GAME_SETTINGS, graphicsQuality: 'auto' }, storage)).toBe(true);
    expect(readGameSettings(storage).graphicsQuality).toBe('auto');
  });

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
    expect(writeGameSettings({ ...DEFAULT_GAME_SETTINGS, reducedMotion: true, fpsLimit: 120 }, storage)).toBe(true);
    expect(values.has(SETTINGS_STORAGE_KEY)).toBe(true);
    expect(readGameSettings(storage)).toMatchObject({ reducedMotion: true, fpsLimit: 120 });
    values.set(SETTINGS_STORAGE_KEY, '{bad json');
    expect(readGameSettings(storage)).toEqual(DEFAULT_GAME_SETTINGS);
  });

  it('defaults the graphics quality to balanced and accepts all four presets', () => {
    expect(DEFAULT_GAME_SETTINGS.graphicsQuality).toBe('balanced');
    for (const option of GRAPHICS_QUALITY_OPTIONS) {
      expect(normalizeSettings({ graphicsQuality: option }).graphicsQuality).toBe(option);
    }
    for (const invalid of ['ultra', '', null, undefined, 2, {}, 'HIGH']) {
      expect(normalizeGraphicsQuality(invalid)).toBe('balanced');
      expect(normalizeSettings({ graphicsQuality: invalid }).graphicsQuality).toBe('balanced');
    }
  });

  it('defaults the FPS limit to 60, accepts only the five limits, and normalizes missing or invalid values', () => {
    expect(DEFAULT_GAME_SETTINGS.fpsLimit).toBe(60);
    for (const option of FPS_LIMIT_OPTIONS) {
      expect(normalizeSettings({ fpsLimit: option }).fpsLimit).toBe(option);
    }
    for (const invalid of [undefined, null, 0, 29, 30.5, 61, 360, '60', {}, true]) {
      expect(normalizeFpsLimit(invalid)).toBe(60);
      expect(normalizeSettings({ fpsLimit: invalid }).fpsLimit).toBe(60);
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

    expect(readGameSettings(storage)).toMatchObject({
      graphicsQuality: 'balanced', fpsLimit: 60, reducedMotion: true, animationSpeed: 1.5,
    });
  });

  it('migrates the V1 storage key to V2, defaults language to Vietnamese, and preserves existing preferences', () => {
    const values = new Map<string, string>([[LEGACY_SETTINGS_STORAGE_KEY, JSON.stringify({
      version: 1,
      masterVolume: 0.35,
      musicVolume: 0.45,
      sfxVolume: 0.55,
      animationSpeed: 1.5,
      reducedMotion: true,
      fullscreen: true,
    })]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };

    expect(readGameSettings(storage)).toEqual({
      ...DEFAULT_GAME_SETTINGS,
      masterVolume: 0.35,
      musicVolume: 0.45,
      sfxVolume: 0.55,
      animationSpeed: 1.5,
      reducedMotion: true,
      fullscreen: true,
    });
    expect(JSON.parse(values.get(SETTINGS_STORAGE_KEY) ?? '{}')).toMatchObject({ version: 3, language: 'vi' });
  });

  it('preserves English when reading V2 preferences and normalizes an invalid language to Vietnamese', () => {
    expect(normalizeSettings({ ...DEFAULT_GAME_SETTINGS, language: 'en' }).language).toBe('en');
    expect(normalizeSettings({ ...DEFAULT_GAME_SETTINGS, language: 'fr' }).language).toBe('vi');
  });
});
