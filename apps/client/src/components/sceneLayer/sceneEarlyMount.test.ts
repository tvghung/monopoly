import { describe, expect, it, vi } from 'vitest';
import {
  LOBBY_SCENE_DELAY_MS,
  LOBBY_SCENE_IDLE_TIMEOUT_MS,
  scheduleEarlyMount,
  type EarlyMountEnvironment,
} from './sceneEarlyMount';

function harness() {
  const state = { hidden: false, saveData: false };
  const visibleCallbacks: Array<() => void> = [];
  const laterTasks: Array<{ task: () => void; delayMs: number; cancelled: boolean }> = [];
  const idleTasks: Array<{ task: () => void; timeoutMs: number; cancelled: boolean }> = [];
  const env: EarlyMountEnvironment = {
    later: (task, delayMs) => {
      const entry = { task, delayMs, cancelled: false };
      laterTasks.push(entry);
      return () => { entry.cancelled = true; };
    },
    whenIdle: (task, timeoutMs) => {
      const entry = { task, timeoutMs, cancelled: false };
      idleTasks.push(entry);
      return () => { entry.cancelled = true; };
    },
    isHidden: () => state.hidden,
    onVisible: callback => {
      visibleCallbacks.push(callback);
      return () => {
        const at = visibleCallbacks.indexOf(callback);
        if (at >= 0) visibleCallbacks.splice(at, 1);
      };
    },
    saveData: () => state.saveData,
  };
  const live = <T extends { cancelled: boolean }>(items: T[]) => items.filter(item => !item.cancelled);
  return { env, state, visibleCallbacks, laterTasks, idleTasks, live };
}

describe('scheduleEarlyMount', () => {
  it('waits the lobby delay, then for idle time, then reports ready once', () => {
    const h = harness();
    const onReady = vi.fn();
    scheduleEarlyMount(onReady, h.env);
    expect(h.laterTasks).toHaveLength(1);
    expect(h.laterTasks[0].delayMs).toBe(LOBBY_SCENE_DELAY_MS);
    expect(h.idleTasks).toHaveLength(0);
    h.laterTasks[0].task();
    expect(h.idleTasks).toHaveLength(1);
    expect(h.idleTasks[0].timeoutMs).toBe(LOBBY_SCENE_IDLE_TIMEOUT_MS);
    expect(onReady).not.toHaveBeenCalled();
    h.idleTasks[0].task();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the device asks to save data', () => {
    const h = harness();
    h.state.saveData = true;
    const onReady = vi.fn();
    scheduleEarlyMount(onReady, h.env);
    expect(h.laterTasks).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('cancel before the delay ends starts nothing', () => {
    const h = harness();
    const onReady = vi.fn();
    const cancel = scheduleEarlyMount(onReady, h.env);
    cancel();
    h.laterTasks[0].task();
    expect(h.idleTasks).toHaveLength(0);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('cancel while waiting for idle time reports nothing', () => {
    const h = harness();
    const onReady = vi.fn();
    const cancel = scheduleEarlyMount(onReady, h.env);
    h.laterTasks[0].task();
    cancel();
    expect(h.live(h.idleTasks)).toHaveLength(0);
    h.idleTasks[0].task();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('a hidden tab waits until it is visible again', () => {
    const h = harness();
    const onReady = vi.fn();
    scheduleEarlyMount(onReady, h.env);
    h.state.hidden = true;
    h.laterTasks[0].task();
    expect(h.idleTasks).toHaveLength(0);
    expect(h.visibleCallbacks).toHaveLength(1);
    h.state.hidden = false;
    h.visibleCallbacks[0]();
    expect(h.idleTasks).toHaveLength(1);
    h.idleTasks[0].task();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a tab hidden while waiting for idle time waits again instead of reporting ready', () => {
    const h = harness();
    const onReady = vi.fn();
    scheduleEarlyMount(onReady, h.env);
    h.laterTasks[0].task();
    h.state.hidden = true;
    h.idleTasks[0].task();
    expect(onReady).not.toHaveBeenCalled();
    expect(h.visibleCallbacks).toHaveLength(1);
  });

  it('cancel while hidden removes the visibility listener', () => {
    const h = harness();
    const cancel = scheduleEarlyMount(vi.fn(), h.env);
    h.state.hidden = true;
    h.laterTasks[0].task();
    expect(h.visibleCallbacks).toHaveLength(1);
    cancel();
    expect(h.visibleCallbacks).toHaveLength(0);
  });
});
