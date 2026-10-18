import { describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import { FrameWarmupHost, type PostChain } from './warmupHost';

function schedulerSpy() {
  const releases: Array<ReturnType<typeof vi.fn>> = [];
  return {
    releases,
    scheduler: {
      hold: vi.fn(() => {
        const release = vi.fn();
        releases.push(release);
        return release;
      }),
    },
  };
}

function manualTimers() {
  const timers = new Map<number, () => void>();
  let next = 1;
  return {
    setTimeout: (callback: () => void) => { timers.set(next, callback); return next++; },
    clearTimeout: (id: unknown) => { timers.delete(id as number); },
    fireAll: () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
    count: () => timers.size,
  };
}

describe('FrameWarmupHost', () => {
  it('holds the frames from the moment a scheduler is attached', () => {
    const { scheduler } = schedulerSpy();
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...manualTimers() });
    host.attach(scheduler);
    expect(scheduler.hold).toHaveBeenCalledTimes(1);
  });

  it('holds once however often it is asked and releases once', () => {
    const { scheduler, releases } = schedulerSpy();
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...manualTimers() });
    host.attach(scheduler);
    host.hold();
    host.hold();
    expect(scheduler.hold).toHaveBeenCalledTimes(1);

    host.release();
    host.release();
    expect(releases[0]).toHaveBeenCalledTimes(1);

    host.hold();
    expect(scheduler.hold).toHaveBeenCalledTimes(2);
  });

  it('lets the frames resume when the watchdog fires, and says so', () => {
    const { scheduler, releases } = schedulerSpy();
    const timers = manualTimers();
    const onWatchdog = vi.fn();
    const host = new FrameWarmupHost({ watchdogMs: 1_000, onWatchdog, ...timers });
    host.attach(scheduler);

    timers.fireAll();

    expect(onWatchdog).toHaveBeenCalledTimes(1);
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it('cancels the watchdog on a normal release', () => {
    const { scheduler } = schedulerSpy();
    const timers = manualTimers();
    const onWatchdog = vi.fn();
    const host = new FrameWarmupHost({ watchdogMs: 1_000, onWatchdog, ...timers });
    host.attach(scheduler);
    host.release();
    expect(timers.count()).toBe(0);
    timers.fireAll();
    expect(onWatchdog).not.toHaveBeenCalled();
  });

  it('does nothing when no scheduler is attached (a scene without frames)', () => {
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...manualTimers() });
    expect(() => { host.hold(); host.release(); host.dispose(); }).not.toThrow();
  });

  it('moves the hold to the scheduler of a new canvas', () => {
    const first = schedulerSpy();
    const second = schedulerSpy();
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...manualTimers() });
    host.attach(first.scheduler);
    host.attach(second.scheduler);
    expect(first.releases[0]).toHaveBeenCalledTimes(1);
    expect(second.scheduler.hold).toHaveBeenCalledTimes(1);
  });
});

describe('FrameWarmupHost loading indicator', () => {
  it('reports pending from the first attach until the first release, and never again for later holds', () => {
    const { scheduler } = schedulerSpy();
    const changes: boolean[] = [];
    const host = new FrameWarmupHost({ watchdogMs: 1_000, onInitialPendingChange: pending => changes.push(pending), ...manualTimers() });

    host.attach(scheduler);
    expect(changes).toEqual([true]);

    host.release();
    expect(changes).toEqual([true, false]);

    // A tier switch holds the frames again, but the picture on screen stays: no loading indicator.
    host.hold();
    host.release();
    expect(changes).toEqual([true, false]);
  });

  it('ends the indicator when the watchdog releases the frames or the scene goes away', () => {
    const first = schedulerSpy();
    const timers = manualTimers();
    const changes: boolean[] = [];
    const watchdogHost = new FrameWarmupHost({ watchdogMs: 1_000, onInitialPendingChange: pending => changes.push(pending), ...timers });
    watchdogHost.attach(first.scheduler);
    timers.fireAll();
    expect(changes).toEqual([true, false]);

    const second = schedulerSpy();
    const disposed: boolean[] = [];
    const disposedHost = new FrameWarmupHost({ watchdogMs: 1_000, onInitialPendingChange: pending => disposed.push(pending), ...manualTimers() });
    disposedHost.attach(second.scheduler);
    disposedHost.dispose();
    expect(disposed).toEqual([true, false]);
  });
});

describe('FrameWarmupHost environment rendezvous', () => {
  it('resolves true at once when the environment already settled', async () => {
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...manualTimers() });
    host.markEnvironmentSettled();
    host.markEnvironmentSettled();
    await expect(host.waitForEnvironment(new AbortController().signal, 100)).resolves.toBe(true);
  });

  it('resolves true when the environment settles while the warm-up waits', async () => {
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...manualTimers() });
    const waiting = host.waitForEnvironment(new AbortController().signal, 100);
    host.markEnvironmentSettled();
    await expect(waiting).resolves.toBe(true);
  });

  it('resolves false on timeout, abort and dispose, so a missing environment never holds the board', async () => {
    const timers = manualTimers();
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...timers });
    const timedOut = host.waitForEnvironment(new AbortController().signal, 100);
    timers.fireAll();
    await expect(timedOut).resolves.toBe(false);

    const controller = new AbortController();
    const aborted = host.waitForEnvironment(controller.signal, 100);
    controller.abort();
    await expect(aborted).resolves.toBe(false);

    const disposed = host.waitForEnvironment(new AbortController().signal, 100);
    host.dispose();
    await expect(disposed).resolves.toBe(false);
  });
});

describe('FrameWarmupHost post chain rendezvous', () => {
  const chain = { inputBuffer: {} as THREE.WebGLRenderTarget, passes: [] } satisfies PostChain;

  it('resolves immediately when the chain is already registered', async () => {
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...manualTimers() });
    host.registerPostChain(chain);
    await expect(host.waitForPostChain(new AbortController().signal, 100)).resolves.toBe(chain);
  });

  it('resolves when the chain arrives later (it loads lazily)', async () => {
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...manualTimers() });
    const waiting = host.waitForPostChain(new AbortController().signal, 100);
    host.registerPostChain(chain);
    await expect(waiting).resolves.toBe(chain);
  });

  it('resolves null on timeout, on abort and when the host is disposed', async () => {
    const timers = manualTimers();
    const host = new FrameWarmupHost({ watchdogMs: 1_000, ...timers });
    const timedOut = host.waitForPostChain(new AbortController().signal, 100);
    timers.fireAll();
    await expect(timedOut).resolves.toBeNull();

    const controller = new AbortController();
    const aborted = host.waitForPostChain(controller.signal, 100);
    controller.abort();
    await expect(aborted).resolves.toBeNull();

    const disposed = host.waitForPostChain(new AbortController().signal, 100);
    host.dispose();
    await expect(disposed).resolves.toBeNull();
  });
});
