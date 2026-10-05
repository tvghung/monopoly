import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getDesktopBridge } from './desktopBridge';
import type { AppUpdateState } from './types';

export interface AppUpdateContextValue {
  /** The desktop app has an updater to talk to. A web client, an older bridge and a development run without a feed have none. */
  available: boolean;
  /** What the main process last published; null until it has answered. */
  state: AppUpdateState | null;
  /** The player is in a lobby or a game: an update may download but a restart is not welcome. */
  inSession: boolean;
  /** "Để sau" was pressed for this version in this run (never for a mandatory update). */
  deferred: boolean;
  /** A mandatory update is known: starting or joining multiplayer is blocked until it is installed. */
  locked: boolean;
  /**
   * Applying the downloaded update (or retrying a failed install of it) may happen now: nobody is playing and no room of
   * this machine is open.
   */
  canApply: boolean;
  check: () => Promise<void>;
  download: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  install: () => Promise<void>;
  defer: () => void;
}

const noop = (): Promise<void> => Promise.resolve();

/** What a component sees without a provider (an isolated render, the design lab, a web client): no updater, nothing to show. */
const INERT: AppUpdateContextValue = {
  available: false,
  state: null,
  inSession: false,
  deferred: false,
  locked: false,
  canApply: false,
  check: noop,
  download: noop,
  cancelDownload: noop,
  install: noop,
  defer: () => undefined,
};

const AppUpdateContext = createContext<AppUpdateContextValue>(INERT);

export function useAppUpdate(): AppUpdateContextValue {
  return useContext(AppUpdateContext);
}

interface AppUpdateProviderProps {
  /** The player is in a lobby or a game (the launcher is not showing). */
  inSession: boolean;
  children: ReactNode;
}

/**
 * Holds the update state of the desktop main process for the whole renderer, above both the launcher and the game: it
 * outlives the launcher, so a "Để sau" pressed on the start screen is still remembered when the player comes back to it.
 * The main process owns the state; this only reads it, and asks for the next step (check, download, cancel, install).
 */
export function AppUpdateProvider({ inSession, children }: AppUpdateProviderProps) {
  const bridge = getDesktopBridge()?.update;
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [deferredVersion, setDeferredVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!bridge) return undefined;
    let active = true;
    let pushed = false;
    const remove = bridge.onStateChanged(next => {
      pushed = true;
      if (active) setState(next);
    });
    // A state that was pushed while this answer was on its way is newer than it.
    void bridge.getState().then(next => {
      if (active && !pushed) setState(next);
    }).catch(() => undefined);
    return () => {
      active = false;
      remove();
    };
  }, [bridge]);

  const run = useCallback(async (call: () => Promise<AppUpdateState>): Promise<void> => {
    try {
      setState(await call());
    } catch {
      // The main process publishes what happened; a call that could not even be delivered changes nothing.
    }
  }, []);

  const check = useCallback(() => (bridge ? run(() => bridge.check()) : noop()), [bridge, run]);
  const download = useCallback(() => (bridge ? run(() => bridge.download()) : noop()), [bridge, run]);
  const cancelDownload = useCallback(() => (bridge ? run(() => bridge.cancelDownload()) : noop()), [bridge, run]);
  const install = useCallback(() => (bridge ? run(() => bridge.install()) : noop()), [bridge, run]);

  const update = state?.update;
  const defer = useCallback(() => {
    if (update && !update.mandatory) setDeferredVersion(update.version);
  }, [update]);

  const value = useMemo<AppUpdateContextValue>(() => {
    if (!bridge || !state || state.phase === 'unsupported') return INERT;
    // Both states have a downloaded installer waiting: "ready", and "error" after a failed install (its retry).
    const installable = state.phase === 'ready' || (state.phase === 'error' && state.error?.stage === 'install');
    return {
      available: true,
      state,
      inSession,
      deferred: Boolean(update && !update.mandatory && deferredVersion === update.version),
      locked: update?.mandatory === true,
      canApply: installable && !inSession && state.installBlocked === undefined,
      check,
      download,
      cancelDownload,
      install,
      defer,
    };
  }, [bridge, cancelDownload, check, defer, deferredVersion, download, inSession, install, state, update]);

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}
