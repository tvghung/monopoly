import {
  DEFAULT_GAME_SETTINGS,
  LEGACY_SETTINGS_STORAGE_KEY,
  PREVIOUS_SETTINGS_STORAGE_KEY,
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
    const current = storage.getItem(SETTINGS_STORAGE_KEY);
    if (current !== null) return normalizeSettings(JSON.parse(current));
    const previous = storage.getItem(PREVIOUS_SETTINGS_STORAGE_KEY);
    if (previous !== null) {
      const migrated = normalizeSettings(JSON.parse(previous));
      // V2 could persist its old default Auto. Treat every V2 Auto as the new default once;
      // an explicit Auto selected in V3 remains available and is preserved on later reads.
      if (migrated.graphicsQuality === 'auto') migrated.graphicsQuality = 'balanced';
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    const legacy = storage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (legacy === null) return { ...DEFAULT_GAME_SETTINGS };
    const migrated = normalizeSettings(JSON.parse(legacy));
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
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

