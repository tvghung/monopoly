import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import settingsContext from './SettingsContext';
import { createSettingsStore } from './settingsStore';
import {
  DEFAULT_GAME_SETTINGS,
  normalizeSettings,
} from './defaults';
import { getDesktopBridge } from '../runtime/desktopBridge';
import { GraphicsQualityDocumentSync } from './GraphicsQualityDocumentSync';
import { ReducedMotionDocumentSync } from './ReducedMotionDocumentSync';
import { LanguageDocumentSync } from '../i18n/LanguageDocumentSync';
import { readGameSettings, writeGameSettings } from './storage';
import type { GameSettings, GameSettingsPatch } from './types';

interface SettingsProviderProps {
  children: ReactNode;
  initialSettings?: GameSettings;
}

export function SettingsProvider({ children, initialSettings }: SettingsProviderProps) {
  // The store is the one holder of the settings. The provider does not read them while rendering, so a change re-renders
  // only the components that read the settings (`useSettings`, `useSettingsSelector`), not the provider and not what it wraps.
  const [store] = useState(() => createSettingsStore(
    initialSettings ? normalizeSettings(initialSettings) : readGameSettings(),
  ));
  const startupFullscreenIntentRef = useRef(store.getSnapshot().fullscreen);
  const startupFullscreenAppliedRef = useRef(false);
  const desktopBridge = getDesktopBridge();

  useEffect(() => {
    writeGameSettings(store.getSnapshot());
    return store.subscribe(() => writeGameSettings(store.getSnapshot()));
  }, [store]);

  const updateSettings = useCallback((patch: GameSettingsPatch) => {
    store.set(normalizeSettings({ ...store.getSnapshot(), ...patch }));
  }, [store]);
  const resetSettings = useCallback(() => {
    store.set({ ...DEFAULT_GAME_SETTINGS });
    if (desktopBridge) void desktopBridge.window.setFullscreen(false);
  }, [desktopBridge, store]);

  useEffect(() => {
    if (!desktopBridge) return undefined;
    let active = true;
    const syncFullscreen = (fullscreen: boolean) => {
      const current = store.getSnapshot();
      if (current.fullscreen !== fullscreen) store.set(normalizeSettings({ ...current, fullscreen }));
    };
    const removeListener = desktopBridge.window.onFullscreenChanged(state => {
      if (active) syncFullscreen(state.fullscreen);
    });
    if (!startupFullscreenAppliedRef.current) {
      startupFullscreenAppliedRef.current = true;
      void desktopBridge.window.setFullscreen(startupFullscreenIntentRef.current).catch(error => {
        console.error('Could not apply the saved fullscreen preference.', error);
      });
    }
    return () => {
      active = false;
      removeListener();
    };
  }, [desktopBridge, store]);

  const value = useMemo(() => ({ available: true, store, updateSettings, resetSettings }), [
    resetSettings,
    store,
    updateSettings,
  ]);

  return (
    <settingsContext.Provider value={value}>
      <ReducedMotionDocumentSync />
      <GraphicsQualityDocumentSync />
      <LanguageDocumentSync />
      {children}
    </settingsContext.Provider>
  );
}
