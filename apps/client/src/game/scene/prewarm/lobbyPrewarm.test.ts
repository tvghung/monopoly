import { afterEach, describe, expect, it, vi } from 'vitest';
import { startLobbyPrewarm, type PrewarmEnvironment } from './lobbyPrewarm';
import type { PrewarmTask } from './lobbyPrewarmTasks';

interface Harness {
  env: PrewarmEnvironment;
  ran: string[];
  scheduled: Array<{ task: () => void; timeoutMs: number; cancelled: boolean }>;
  state: { hidden: boolean; inputPending: boolean; saveData: boolean; webgl: boolean };
  visibleListeners: Array<() => void>;
  loadChunk: ReturnType<typeof vi.fn>;
  loadTasks: ReturnType<typeof vi.fn>;
  flushOne(): void;
}

function harness(taskNames: string[]): Harness {
  const ran: string[] = [];
  const scheduled: Harness['scheduled'] = [];
  const visibleListeners: Array<() => void> = [];
  const state = { hidden: false, inputPending: false, saveData: false, webgl: true };
  let clock = 0;
  const tasks: PrewarmTask[] = taskNames.map(name => ({
    name,
    run: () => {
      ran.push(name);
      clock += 10;
    },
  }));
  const loadChunk = vi.fn(() => Promise.resolve({}));
  const loadTasks = vi.fn(() => Promise.resolve(tasks));
  const env: PrewarmEnvironment = {
    schedule: (task, timeoutMs) => {
      const entry = { task, timeoutMs, cancelled: false };
      scheduled.push(entry);
      return () => { entry.cancelled = true; };
    },
    now: () => clock,
    isHidden: () => state.hidden,
    onVisible: callback => {
      visibleListeners.push(callback);
      return () => {
        const at = visibleListeners.indexOf(callback);
        if (at >= 0) visibleListeners.splice(at, 1);
      };
    },
    isInputPending: () => state.inputPending,
    saveData: () => state.saveData,
    webglSupported: () => state.webgl,
    loadTasks,
    loadChunk,
  };
  return {
    env, ran, scheduled, state, visibleListeners, loadChunk, loadTasks,
    flushOne: () => {
      const entry = scheduled.find(item => !item.cancelled);
      if (!entry) return;
      entry.cancelled = true;
      entry.task();
    },
  };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('startLobbyPrewarm', () => {
  it('runs one slice per idle callback, in order, and loads the scene chunk once it has work', async () => {
    const h = harness(['a', 'b', 'c']);
    startLobbyPrewarm('auto', h.env);
    await settle();
    expect(h.loadChunk).toHaveBeenCalledTimes(1);
    expect(h.ran).toEqual([]);
    h.flushOne();
    expect(h.ran).toEqual(['a']);
    h.flushOne();
    h.flushOne();
    expect(h.ran).toEqual(['a', 'b', 'c']);
    h.flushOne();
    expect(h.ran).toEqual(['a', 'b', 'c']);
    expect(h.scheduled.filter(item => !item.cancelled)).toHaveLength(0);
  });

  it('reports each slice with its duration', async () => {
    const h = harness(['a', 'b']);
    const events: Array<{ task: string; durationMs: number }> = [];
    startLobbyPrewarm('auto', { ...h.env, report: event => events.push(event) });
    await settle();
    h.flushOne();
    h.flushOne();
    expect(events).toEqual([{ task: 'a', durationMs: 10 }, { task: 'b', durationMs: 10 }]);
  });

  it('does nothing where it would cost more than it saves', async () => {
    const saveData = harness(['a']);
    saveData.state.saveData = true;
    startLobbyPrewarm('auto', saveData.env);
    const noWebgl = harness(['a']);
    noWebgl.state.webgl = false;
    startLobbyPrewarm('auto', noWebgl.env);
    await settle();
    for (const h of [saveData, noWebgl]) {
      expect(h.loadTasks).not.toHaveBeenCalled();
      expect(h.loadChunk).not.toHaveBeenCalled();
      expect(h.scheduled).toHaveLength(0);
    }
  });

  it('prepares nothing and loads no chunk for a tier with no slices (low)', async () => {
    const h = harness([]);
    startLobbyPrewarm('low', h.env);
    await settle();
    expect(h.loadTasks).toHaveBeenCalledWith('low');
    expect(h.loadChunk).not.toHaveBeenCalled();
    expect(h.scheduled).toHaveLength(0);
  });

  it('cancel stops what has not run and nothing runs afterwards', async () => {
    const h = harness(['a', 'b', 'c']);
    const cancel = startLobbyPrewarm('auto', h.env);
    await settle();
    h.flushOne();
    cancel();
    h.flushOne();
    expect(h.ran).toEqual(['a']);
    expect(h.scheduled.filter(item => !item.cancelled)).toHaveLength(0);
  });

  it('cancelled before the slices were loaded starts nothing', async () => {
    const h = harness(['a']);
    const cancel = startLobbyPrewarm('auto', h.env);
    cancel();
    await settle();
    expect(h.loadChunk).not.toHaveBeenCalled();
    expect(h.scheduled).toHaveLength(0);
    expect(h.ran).toEqual([]);
  });

  it('pauses while the tab is hidden and continues when it is visible again', async () => {
    const h = harness(['a', 'b']);
    startLobbyPrewarm('auto', h.env);
    await settle();
    h.state.hidden = true;
    h.flushOne();
    expect(h.ran).toEqual([]);
    expect(h.visibleListeners).toHaveLength(1);
    h.state.hidden = false;
    h.visibleListeners[0]();
    expect(h.ran).toEqual(['a']);
    expect(h.visibleListeners).toHaveLength(0);
  });

  it('cancel while hidden removes the visibility listener', async () => {
    const h = harness(['a']);
    const cancel = startLobbyPrewarm('auto', h.env);
    await settle();
    h.state.hidden = true;
    h.flushOne();
    expect(h.visibleListeners).toHaveLength(1);
    cancel();
    expect(h.visibleListeners).toHaveLength(0);
  });

  it('yields to pending input and retries shortly', async () => {
    const h = harness(['a']);
    startLobbyPrewarm('auto', h.env);
    await settle();
    h.state.inputPending = true;
    h.flushOne();
    expect(h.ran).toEqual([]);
    const retry = h.scheduled.filter(item => !item.cancelled);
    expect(retry).toHaveLength(1);
    expect(retry[0].timeoutMs).toBe(50);
    h.state.inputPending = false;
    h.flushOne();
    expect(h.ran).toEqual(['a']);
  });

  it('a failed chunk load does not stop the slices', async () => {
    const h = harness(['a']);
    h.loadChunk.mockRejectedValue(new Error('offline'));
    startLobbyPrewarm('auto', h.env);
    await settle();
    h.flushOne();
    expect(h.ran).toEqual(['a']);
  });
});
