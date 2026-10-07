import { createContext } from 'react';
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

const settingsContext = createContext<SettingsContextValue>({
  settings: {
    version: 2,
    language: 'vi',
    masterVolume: 1,
    musicVolume: 0.7,
    sfxVolume: 0.8,
    animationSpeed: 1,
    reducedMotion: false,
    fullscreen: false,
    graphicsQuality: 'auto',
  },
  updateSettings: () => {},
  resetSettings: () => {},
});

export default settingsContext;

