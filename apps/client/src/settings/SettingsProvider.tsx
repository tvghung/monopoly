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
import { getDesktopBridge } from '../runtime/desktopBridge';
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
  const desktopBridge = getDesktopBridge();

  useEffect(() => {
    writeGameSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: GameSettingsPatch) => {
    setSettings(current => normalizeSettings({ ...current, ...patch }));
  }, []);
  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_GAME_SETTINGS });
    if (desktopBridge) void desktopBridge.window.setFullscreen(false);
  }, [desktopBridge]);

  useEffect(() => {
    if (!desktopBridge) return undefined;
    let active = true;
    const syncFullscreen = (fullscreen: boolean) => {
      setSettings(current => current.fullscreen === fullscreen
        ? current
        : normalizeSettings({ ...current, fullscreen }));
    };
    void desktopBridge.window.getState().then(state => {
      if (active) syncFullscreen(state.fullscreen);
    });
    const removeListener = desktopBridge.window.onFullscreenChanged(state => {
      syncFullscreen(state.fullscreen);
    });
    return () => {
      active = false;
      removeListener();
    };
  }, [desktopBridge]);

  const value = useMemo(() => ({ settings, updateSettings, resetSettings }), [
    resetSettings,
    settings,
    updateSettings,
  ]);

  return <settingsContext.Provider value={value}>{children}</settingsContext.Provider>;
}
