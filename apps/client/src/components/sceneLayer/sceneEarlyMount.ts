/**
 * When the lobby may start building the board's scene ahead of the board (08H Task 3, design A1).
 *
 * The scene's first mount is unsliceable main-thread work of about 0.7 s (the WebGL context 0.43 s, the React build of the scene), so it
 * must not land in the middle of what the player is doing in the lobby: it waits a moment after the lobby appears, then for an idle
 * period, and only on devices where a board is cheap enough to keep alive. If the board is shown before then, it mounts the scene itself
 * at once (that is the situation without this layer).
 */
export const LOBBY_SCENE_DELAY_MS = 1_500;
export const LOBBY_SCENE_IDLE_TIMEOUT_MS = 4_000;

export interface EarlyMountEnvironment {
  /** Runs `task` after `delayMs`. Returns a cancel function. */
  later(task: () => void, delayMs: number): () => void;
  /** Runs `task` when the browser is idle, or after `timeoutMs` at the latest. Returns a cancel function. */
  whenIdle(task: () => void, timeoutMs: number): () => void;
  isHidden(): boolean;
  /** Calls back once when the page becomes visible. Returns an unsubscribe function. */
  onVisible(callback: () => void): () => void;
  saveData(): boolean;
}

export function browserEarlyMountEnvironment(): EarlyMountEnvironment {
  return {
    later: (task, delayMs) => {
      const id = window.setTimeout(task, delayMs);
      return () => window.clearTimeout(id);
    },
    whenIdle: (task, timeoutMs) => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => task(), { timeout: timeoutMs });
        return () => window.cancelIdleCallback(id);
      }
      const id = window.setTimeout(task, 0);
      return () => window.clearTimeout(id);
    },
    isHidden: () => document.hidden,
    onVisible: callback => {
      const listener = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', listener);
        callback();
      };
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
    saveData: () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true,
  };
}

/**
 * Calls `onReady` once the lobby has been shown for a moment and the browser is idle, on a visible tab. Does nothing when the device
 * asks to save data. Returns the cancel function (the lobby ended, or the settings changed).
 */
export function scheduleEarlyMount(onReady: () => void, env: EarlyMountEnvironment = browserEarlyMountEnvironment()): () => void {
  if (env.saveData()) return () => {};
  let cancelled = false;
  let cancelPending: (() => void) | null = null;
  let unsubscribeVisible: (() => void) | null = null;

  const attempt = (): void => {
    cancelPending = null;
    if (cancelled) return;
    if (env.isHidden()) {
      unsubscribeVisible = env.onVisible(() => {
        unsubscribeVisible = null;
        attempt();
      });
      return;
    }
    cancelPending = env.whenIdle(() => {
      cancelPending = null;
      if (cancelled) return;
      // The tab may have been hidden while waiting for idle time: wait for it again.
      if (env.isHidden()) {
        attempt();
        return;
      }
      onReady();
    }, LOBBY_SCENE_IDLE_TIMEOUT_MS);
  };
  cancelPending = env.later(attempt, LOBBY_SCENE_DELAY_MS);

  return () => {
    cancelled = true;
    cancelPending?.();
    unsubscribeVisible?.();
  };
}
