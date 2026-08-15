import {
  DEFAULT_GAME_SETTINGS,
  normalizeSettings,
  SETTINGS_STORAGE_KEY,
} from './defaults';
import type { GameSettings } from './types';

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): SettingsStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage;
}

export function readGameSettings(
  storage: SettingsStorage | undefined = browserStorage(),
): GameSettings {
  if (!storage) return { ...DEFAULT_GAME_SETTINGS };
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULT_GAME_SETTINGS };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
}

export function writeGameSettings(
  settings: GameSettings,
  storage: SettingsStorage | undefined = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

