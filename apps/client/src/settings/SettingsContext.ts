import { createContext } from 'react';
import type { GameSettings, GameSettingsPatch } from './types';

export interface SettingsContextValue {
  settings: GameSettings;
  updateSettings: (patch: GameSettingsPatch) => void;
  resetSettings: () => void;
}

const settingsContext = createContext<SettingsContextValue>({
  settings: {
    version: 1,
    masterVolume: 1,
    musicVolume: 0.7,
    sfxVolume: 0.8,
    animationSpeed: 1,
    reducedMotion: false,
    fullscreen: false,
  },
  updateSettings: () => {},
  resetSettings: () => {},
});

export default settingsContext;

