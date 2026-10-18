import type { GraphicsQualitySetting } from '../../../settings/types';
import { getSharedWebGLProbe } from '../fallback/webglProbe';
import { markSceneOnce } from '../render/warmup/sceneMarks';
import type { PrewarmTask } from './lobbyPrewarmTasks';

/**
 * Work the board will need that does not depend on the room, done while the lobby is idle (08H Task 1): the procedural textures of the
 * player's graphics tier generated in slices into `proceduralTextureCache`, and the scene chunk. (The throwaway WebGL probe context is
 * not part of it: the settings sync already creates it at start-up, which the load marks show at about 0.5 s.)
 *
 * Skipped where it would cost more than it saves: the low tier (its textures are small and the board is cheap), a device that asks to
 * save data, and a page without WebGL. It pauses while the tab is hidden and yields to pending input. This file is in the app's first
 * chunk, so it imports nothing heavy: the slices and the scene are loaded on demand.
 */

const IDLE_TIMEOUT_MS = 500;
const INPUT_PENDING_RETRY_MS = 50;

export interface PrewarmEnvironment {
  /** Starts a task when the browser is idle (or after `timeoutMs`). Returns a cancel function. */
  schedule(task: () => void, timeoutMs: number): () => void;
  now(): number;
  isHidden(): boolean;
  /** Calls back when the page becomes visible. Returns an unsubscribe function. */
  onVisible(callback: () => void): () => void;
  isInputPending(): boolean;
  saveData(): boolean;
  webglSupported(): boolean;
  /** Loads the slices for the tier. Empty when there is nothing to prepare. */
  loadTasks(graphicsQuality: GraphicsQualitySetting): Promise<PrewarmTask[]>;
  /** Loads the scene chunk. */
  loadChunk(): Promise<unknown>;
  report?(event: { task: string; durationMs: number }): void;
}

export function browserPrewarmEnvironment(): PrewarmEnvironment {
  return {
    schedule: (task, timeoutMs) => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(() => task(), { timeout: timeoutMs });
        return () => window.cancelIdleCallback(id);
      }
      const id = window.setTimeout(task, 0);
      return () => window.clearTimeout(id);
    },
    now: () => performance.now(),
    isHidden: () => document.hidden,
    onVisible: callback => {
      const listener = () => { if (!document.hidden) callback(); };
      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },
    isInputPending: () => (navigator as Navigator & { scheduling?: { isInputPending?: () => boolean } }).scheduling?.isInputPending?.() ?? false,
    saveData: () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true,
    webglSupported: () => getSharedWebGLProbe().supported,
    loadTasks: async graphicsQuality => (await import('./lobbyPrewarmTasks')).buildPrewarmTasks(graphicsQuality),
    loadChunk: () => import('../GameScene'),
  };
}

/**
 * Starts the preparation and returns a function that cancels what has not run yet. A change of graphics tier is the caller's job:
 * cancel, then start again (what was prepared for the old tier is simply never taken). Does nothing where it does not apply.
 */
export function startLobbyPrewarm(
  graphicsQuality: GraphicsQualitySetting,
  env: PrewarmEnvironment = browserPrewarmEnvironment(),
): () => void {
  if (env.saveData() || !env.webglSupported()) return () => {};
  let cancelled = false;
  let cancelScheduled: (() => void) | null = null;
  let unsubscribeVisible: (() => void) | null = null;
  let tasks: PrewarmTask[] = [];
  let index = 0;

  const next = (): void => {
    cancelScheduled = null;
    if (cancelled || index >= tasks.length) return;
    if (env.isHidden()) {
      unsubscribeVisible = env.onVisible(() => {
        unsubscribeVisible?.();
        unsubscribeVisible = null;
        next();
      });
      return;
    }
    if (env.isInputPending()) {
      cancelScheduled = env.schedule(next, INPUT_PENDING_RETRY_MS);
      return;
    }
    const task = tasks[index];
    if (index === 0) markSceneOnce('prewarm-first');
    index += 1;
    const startedAt = env.now();
    task.run();
    env.report?.({ task: task.name, durationMs: env.now() - startedAt });
    if (index >= tasks.length) markSceneOnce('prewarm-done');
    cancelScheduled = env.schedule(next, IDLE_TIMEOUT_MS);
  };

  void env.loadTasks(graphicsQuality).then(loaded => {
    if (cancelled || loaded.length === 0) return;
    tasks = loaded;
    void env.loadChunk().catch(() => {});
    cancelScheduled = env.schedule(next, IDLE_TIMEOUT_MS);
  }).catch(() => {});

  return () => {
    cancelled = true;
    cancelScheduled?.();
    unsubscribeVisible?.();
  };
}
