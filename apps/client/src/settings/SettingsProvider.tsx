import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import settingsContext from './SettingsContext';
import {
  DEFAULT_GAME_SETTINGS,
  normalizeSettings,
} from './defaults';
import { readGameSettings, writeGameSettings } from './storage';
import type { GameSettings, GameSettingsPatch } from './types';

interface SettingsProviderProps {
  children: ReactNode;
  initialSettings?: GameSettings;
}

export function SettingsProvider({ children, initialSettings }: SettingsProviderProps) {
  const [settings, setSettings] = useState<GameSettings>(
    () => initialSettings ? normalizeSettings(initialSettings) : readGameSettings(),
  );

  useEffect(() => {
    writeGameSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: GameSettingsPatch) => {
    setSettings(current => normalizeSettings({ ...current, ...patch }));
  }, []);
  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_GAME_SETTINGS });
  }, []);

  const value = useMemo(() => ({ settings, updateSettings, resetSettings }), [
    resetSettings,
    settings,
    updateSettings,
  ]);

  return <settingsContext.Provider value={value}>{children}</settingsContext.Provider>;
}

