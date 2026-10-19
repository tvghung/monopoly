import { createContext } from 'react';
import { createSettingsStore, type SettingsStore } from './settingsStore';
import { DEFAULT_GAME_SETTINGS } from './defaults';
import type { GameSettings, GameSettingsPatch } from './types';

/** What `useSettings()` returns: the current settings and the two ways to change them. */
export interface SettingsContextValue {
  /**
   * True inside a `SettingsProvider`. Outside one (an isolated render in a test) a change goes nowhere, so a screen that offers
   * the settings dialog leaves its "Cài đặt" button out instead of showing one that does nothing.
   */
  available?: boolean;
  settings: GameSettings;
  updateSettings: (patch: GameSettingsPatch) => void;
  resetSettings: () => void;
}

/**
 * What the settings context carries. It never changes while a provider is mounted: the settings themselves live in `store` and
 * are read through `useSettings()` (every setting) or `useSettingsSelector()` (one value). A context whose value changed with
 * every setting would re-render everything that sits under the 3D canvas: react-three-fiber re-provides every ancestor context
 * inside its tree, so a changed ancestor context is a React commit on the scene even when nothing in the scene reads it
 * (Phase B2, PERF-03).
 */
export interface SettingsContextHandle {
  available: boolean;
  store: SettingsStore;
  updateSettings: (patch: GameSettingsPatch) => void;
  resetSettings: () => void;
}

const settingsContext = createContext<SettingsContextHandle>({
  available: false,
  store: createSettingsStore(DEFAULT_GAME_SETTINGS),
  updateSettings: () => {},
  resetSettings: () => {},
});

export default settingsContext;
