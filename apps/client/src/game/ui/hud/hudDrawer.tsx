import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react';

/** Per-viewer preference for the activity drawer; the drawer is closed unless the viewer left it open. */
export const HUD_DRAWER_STORAGE_KEY = 'own-the-block.hud.drawer.v1';

export function readDrawerPreference(): boolean {
  try {
    return window.localStorage.getItem(HUD_DRAWER_STORAGE_KEY) === 'open';
  } catch {
    return false;
  }
}

export function writeDrawerPreference(open: boolean): void {
  try {
    window.localStorage.setItem(HUD_DRAWER_STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    // Storage can be blocked (private windows, cleared site data); the drawer still works for this visit.
  }
}

export interface HudDrawerState {
  open: boolean;
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void;
}

const HudDrawerContext = createContext<HudDrawerState | null>(null);

function useDrawerState(): HudDrawerState {
  const [open, setOpenState] = useState(readDrawerPreference);
  const setOpen = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    setOpenState(current => {
      const value = typeof next === 'function' ? next(current) : next;
      writeDrawerPreference(value);
      return value;
    });
  }, []);
  return useMemo(() => ({ open, setOpen }), [open, setOpen]);
}

/** Lets the drawer, the activity ticker and the chat bubbles agree on whether the drawer is open. */
export function HudDrawerProvider({ children }: { children: ReactNode }) {
  const state = useDrawerState();
  return <HudDrawerContext.Provider value={state}>{children}</HudDrawerContext.Provider>;
}

/** The shared drawer state, or a private one when the component is used outside a HUD. */
export function useHudDrawer(): HudDrawerState {
  const shared = useContext(HudDrawerContext);
  const local = useDrawerState();
  return shared ?? local;
}
