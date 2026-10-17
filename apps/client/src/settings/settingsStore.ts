import type { GameSettings } from './types';

/**
 * The settings as an external store: the one place that holds the current `GameSettings`. `SettingsProvider` writes it and
 * publishes it twice: as the context value `useSettings()` reads (every setting, every change re-renders the reader) and as
 * this store, which `useSettingsSelector` reads one value at a time, so a component that only needs `reducedMotion` is not
 * re-rendered by a volume slider (Phase B2, PERF-03).
 */
export interface SettingsStore {
  getSnapshot: () => GameSettings;
  subscribe: (listener: () => void) => () => void;
  /** Replaces the settings. Does nothing, and notifies nobody, when every field is equal to the current one. */
  set: (next: GameSettings) => void;
}

function sameSettings(left: GameSettings, right: GameSettings): boolean {
  const keys = Object.keys(left) as (keyof GameSettings)[];
  return keys.length === Object.keys(right).length && keys.every(key => Object.is(left[key], right[key]));
}

export function createSettingsStore(initial: GameSettings): SettingsStore {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: next => {
      if (next === current || sameSettings(current, next)) return;
      current = next;
      [...listeners].forEach(listener => listener());
    },
  };
}
