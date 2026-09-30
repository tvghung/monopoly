import { useCallback, useEffect, useRef, useState } from 'react';

export interface TransientEntry<T> {
  key: string;
  value: T;
  /** `Date.now()` timestamp after which the entry is dropped. */
  expiresAt: number;
}

export interface TransientList<T> {
  entries: readonly TransientEntry<T>[];
  /** Adds (or replaces, by key) an entry that lives `lifetimeMs`; only the newest `max` entries are kept. */
  push: (key: string, value: T, lifetimeMs: number) => void;
  clear: () => void;
}

/**
 * The one timer behind every short-lived HUD element (turn banner, dice callout, delta chips, ticker line, chat
 * bubbles). A single timeout is armed for the earliest expiry, so HUD lifetimes never become chains of
 * `setTimeout` calls per element. Lifetimes are supplied by the caller, already divided by the animation speed.
 */
export function useTransientList<T>(max: number): TransientList<T> {
  const [entries, setEntries] = useState<readonly TransientEntry<T>[]>([]);
  const maxRef = useRef(max);
  maxRef.current = max;

  const push = useCallback((key: string, value: T, lifetimeMs: number) => {
    const entry: TransientEntry<T> = { key, value, expiresAt: Date.now() + Math.max(0, lifetimeMs) };
    setEntries(current => [...current.filter(existing => existing.key !== key), entry].slice(-maxRef.current));
  }, []);
  const clear = useCallback(() => setEntries(current => (current.length === 0 ? current : [])), []);

  useEffect(() => {
    if (entries.length === 0) return undefined;
    const next = Math.min(...entries.map(entry => entry.expiresAt));
    const timer = setTimeout(() => {
      const now = Date.now();
      setEntries(current => {
        const alive = current.filter(entry => entry.expiresAt > now);
        return alive.length === current.length ? current : alive;
      });
    }, Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [entries]);

  return { entries, push, clear };
}
