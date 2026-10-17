import { useSyncExternalStore } from 'react';

/**
 * The hovered tile as an external store (Phase B2, PERF-03). Hover used to be React state in `Board`, so every tile the pointer
 * crossed re-rendered the board and the whole 3D tree to repaint one instance colour. Now the pointer handlers write here,
 * `TileBodyBatch` subscribes and rewrites the instance colours itself (one frame, no React render), and the few DOM readers
 * subscribe with `useTileHover`.
 */
export interface TileHoverStore {
  get: () => number | null;
  /** Sets the hovered tile; does nothing, and notifies nobody, when it is already that tile. */
  set: (tileId: number | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createTileHoverStore(): TileHoverStore {
  let current: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: tileId => {
      if (tileId === current) return;
      current = tileId;
      [...listeners].forEach(listener => listener());
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/** The hovered tile for a DOM component; it re-renders when the hovered tile changes and for nothing else. */
export function useTileHover(store: TileHoverStore): number | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
