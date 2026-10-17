import { createContext } from 'react';
import { createSettingsStore, type SettingsStore } from './settingsStore';
import type { GameSettings, GameSettingsPatch } from './types';

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

const DEFAULT_CONTEXT_SETTINGS: GameSettings = {
  version: 2,
  language: 'vi',
  masterVolume: 1,
  muted: false,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  animationSpeed: 1,
  reducedMotion: false,
  fullscreen: false,
  graphicsQuality: 'auto',
  fpsLimit: 60,
};

const settingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_CONTEXT_SETTINGS,
  updateSettings: () => {},
  resetSettings: () => {},
});

/**
 * The store behind the same settings, for `useSettingsSelector`. Its value never changes while a provider is mounted, so
 * reading it from a component does not subscribe that component to any setting. Without a provider it is a static store of
 * the defaults, as `settingsContext` is.
 */
export const settingsStoreContext = createContext<SettingsStore>(createSettingsStore(DEFAULT_CONTEXT_SETTINGS));

export default settingsContext;
