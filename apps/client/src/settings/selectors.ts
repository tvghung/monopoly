import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import settingsContext, { type SettingsContextValue } from './SettingsContext';
import type { GameSettings } from './types';

/** All of the settings. The component re-renders on every change of any setting; prefer `useSettingsSelector` for one value. */
export function useSettings(): SettingsContextValue {
  const {
    available, store, updateSettings, resetSettings,
  } = useContext(settingsContext);
  const settings = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return useMemo(
    () => ({ available, settings, updateSettings, resetSettings }),
    [available, resetSettings, settings, updateSettings],
  );
}

/**
 * Reads one value of the settings. The component re-renders only when that value changes, not on every change of any setting
 * like `useSettings()`: a scene component that needs `reducedMotion` is not re-rendered by a volume slider. Use it for a
 * primitive (a field, or a value derived from fields); an object would not compare equal and would re-render on every change.
 */
export function useSettingsSelector<T extends string | number | boolean | null | undefined>(
  selector: (settings: GameSettings) => T,
): T {
  const { store } = useContext(settingsContext);
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
}

/** Whether a `SettingsProvider` is above, that is, whether a change made in the settings dialog is kept. */
export function useSettingsAvailable(): boolean {
  return useContext(settingsContext).available;
}

function systemPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useSystemReducedMotion(): boolean {
  // Read at the first render: a dialog that mounts under an OS-level reduced-motion preference must not start from its
  // normal entrance and then stay half-scaled when the preference is noticed one effect later.
  const [reduced, setReduced] = useState(systemPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    if (!media.addEventListener) media.addListener(update);
    return () => {
      media.removeEventListener?.('change', update);
      if (!media.removeEventListener) media.removeListener(update);
    };
  }, []);

  return reduced;
}

const selectReducedMotion = (settings: GameSettings): boolean => settings.reducedMotion;

export function useEffectiveReducedMotion(): boolean {
  // Selected, not read from the whole settings: this runs inside the 3D scene, which no other setting may re-render.
  const reducedMotion = useSettingsSelector(selectReducedMotion);
  const systemReducedMotion = useSystemReducedMotion();
  return reducedMotion || systemReducedMotion;
}
