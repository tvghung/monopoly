import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isCorrectnessRegression } from './phaseE1Mode';
import { lifecycleFixture } from './lifecycleFixture';

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }));

const correctness = isCorrectnessRegression();
// Both modes now require the fixed behavior; pre-fix observations remain in audit05/11/12/15.
const category = correctness ? 'correctness regression' : 'post-fix characterization';
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers(); });

async function startOnline(f: ReturnType<typeof lifecycleFixture>, code: string) {
  await f.track(f.host.start({ mode: 'ONLINE', roomCode: code }));
}

function pendingActivation(f: ReturnType<typeof lifecycleFixture>) {
  const entered = f.deferred(undefined);
  const gate = f.deferred(undefined);
  f.discovery.activate.mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise; });
  return { entered, gate };
}

describe('AUDIT-004 ' + category, () => {
  it('004-A activation success after stop must not republish stopped online state', async () => {
    const f = lifecycleFixture();
    const { entered, gate } = pendingActivation(f);
    try {
      await startOnline(f, 'ROOM-A');
      const activating = f.track(f.host.activateOnlineRoom('ROOM-A'));
      await entered.promise;
      expect(f.discovery.activate).toHaveBeenCalledWith('ROOM-A', 'credential-ROOM-A', f.host.status.onlineEndpoint);
      await f.host.stop();
      const stopped = f.host.status;
      const writesBefore = f.statuses.length;
      gate.resolve(undefined);
      await Promise.allSettled([activating]);
      const writes = f.statuses.slice(writesBefore).map(status => status.onlineState);
      expect({ status: f.host.status, writes }).toEqual({ status: stopped, writes: [] });
      expect(f.discovery.revoke).toHaveBeenCalledExactlyOnceWith('ROOM-A', 'credential-ROOM-A');
      expect(f.helpers[0].stop).toHaveBeenCalledOnce();
      expect(f.connectivity.stop).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    } finally { await f.cleanup(); }
  });

  it('004-B activation failure after stop must not publish DISCOVERY_UNAVAILABLE', async () => {
    const f = lifecycleFixture();
    const { entered, gate } = pendingActivation(f);
    try {
      await startOnline(f, 'ROOM-A');
      const activating = f.track(f.host.activateOnlineRoom('ROOM-A'));
      await entered.promise;
      await f.host.stop();
      const stopped = f.host.status;
      const writesBefore = f.statuses.length;
      gate.reject(new Error('REGISTRY_ACTIVATION_FAILED'));
      await Promise.allSettled([activating]);
      const writes = f.statuses.slice(writesBefore).map(status => status.onlineState);
      expect({ status: f.host.status, writes }).toEqual({ status: stopped, writes: [] });
      expect(vi.getTimerCount()).toBe(0);
    } finally { await f.cleanup(); }
  });

  it('004-C old activation must preserve replacement status, timer and room credentials', async () => {
    const f = lifecycleFixture();
    const { entered, gate } = pendingActivation(f);
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    try {
      await startOnline(f, 'ROOM-A');
      const old = f.track(f.host.activateOnlineRoom('ROOM-A'));
      await entered.promise;
      await f.host.stop();
      await startOnline(f, 'ROOM-B');
      f.discovery.activate.mockRejectedValueOnce(new Error('REGISTRY_ACTIVATION_FAILED'));
      await f.host.activateOnlineRoom('ROOM-B');
      const endpointB = f.host.status.onlineEndpoint;
      const timerB = setInterval.mock.results.at(-1)?.value as ReturnType<typeof globalThis.setInterval>;
      expect(f.host.status.onlineState).toBe('DISCOVERY_UNAVAILABLE');
      gate.resolve(undefined);
      await Promise.allSettled([old]);
      const beforeRenew = f.host.status.onlineState;
      await vi.advanceTimersByTimeAsync(30_000);
      const observed = { beforeRenew, onlineState: f.host.status.onlineState,
        clearedB: clearInterval.mock.calls.some(([timer]) => timer === timerB),
        renewals: f.discovery.renew.mock.calls, timers: vi.getTimerCount() };
      expect(observed).toEqual({ beforeRenew: 'DISCOVERY_UNAVAILABLE', onlineState: 'READY', clearedB: false,
        renewals: [['ROOM-B', 'credential-ROOM-B']], timers: 1 });
      expect(f.host.status.onlineEndpoint).toBe(endpointB);
      expect(f.host.creationCapability('ROOM-A')).toBeUndefined();
      expect(f.host.creationCapability('ROOM-B')).toMatch(/^[a-f0-9]{64}$/u);
      expect(f.discovery.activate.mock.calls).toEqual([
        ['ROOM-A', 'credential-ROOM-A', 'https://lifecycle-1.trycloudflare.com'],
        ['ROOM-B', 'credential-ROOM-B', 'https://lifecycle-2.trycloudflare.com'],
      ]);
      expect(f.discovery.revoke.mock.calls).toEqual([['ROOM-A', 'credential-ROOM-A']]);
      expect(f.helpers).toHaveLength(2);
      expect(f.helpers[1].stop).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
  });

  it.each(['resolve', 'reject'] as const)('004-D late renewal %s must not change a replacement host', async outcome => {
    const f = lifecycleFixture();
    const entered = f.deferred(undefined);
    const gate = f.deferred(undefined);
    try {
      await startOnline(f, 'ROOM-A');
      await f.host.activateOnlineRoom('ROOM-A');
      f.discovery.renew.mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise; });
      await vi.advanceTimersByTimeAsync(30_000);
      await entered.promise;
      await f.host.stop();
      await startOnline(f, 'ROOM-B');
      if (outcome === 'resolve') f.discovery.activate.mockRejectedValueOnce(new Error('REGISTRY_ACTIVATION_FAILED'));
      await f.host.activateOnlineRoom('ROOM-B');
      const stateB = f.host.status.onlineState;
      const writesBefore = f.statuses.length;
      if (outcome === 'resolve') gate.resolve(undefined);
      else gate.reject(new Error('REGISTRY_RENEW_FAILED'));
      await vi.advanceTimersByTimeAsync(0);
      const writes = f.statuses.slice(writesBefore).map(status => status.onlineState);
      expect({ state: f.host.status.onlineState, writes }).toEqual({ state: stateB, writes: [] });
      expect(f.discovery.renew).toHaveBeenCalledExactlyOnceWith('ROOM-A', 'credential-ROOM-A');
      expect(f.host.status.onlineEndpoint).toBe('https://lifecycle-2.trycloudflare.com');
      expect(vi.getTimerCount()).toBe(1);
    } finally { await f.cleanup(); }
  });

  it.each(['resolve', 'reject'] as const)('004-D control: renewal %s after stop keeps no endpoint or timer', async outcome => {
    const f = lifecycleFixture();
    const gate = f.deferred(undefined);
    try {
      await startOnline(f, 'ROOM-A');
      await f.host.activateOnlineRoom('ROOM-A');
      f.discovery.renew.mockImplementationOnce(() => gate.promise);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(f.discovery.renew).toHaveBeenCalledOnce();
      await f.host.stop();
      const stopped = f.host.status;
      const writesBefore = f.statuses.length;
      if (outcome === 'resolve') gate.resolve(undefined);
      else gate.reject(new Error('REGISTRY_RENEW_FAILED'));
      await vi.advanceTimersByTimeAsync(0);
      expect(f.host.status).toEqual(stopped);
      expect(f.statuses.slice(writesBefore)).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally { await f.cleanup(); }
  });

  it('004-E concurrent old activations must not cross into the replacement lifecycle', async () => {
    const f = lifecycleFixture();
    const first = { gate: f.deferred(undefined), entered: f.deferred(undefined) };
    const second = { gate: f.deferred(undefined), entered: f.deferred(undefined) };
    let attempts = 0;
    f.discovery.activate.mockImplementation(code => {
      if (code !== 'ROOM-A') return Promise.resolve();
      const operation = attempts++ === 0 ? first : second;
      operation.entered.resolve(undefined);
      return operation.gate.promise;
    });
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    try {
      await startOnline(f, 'ROOM-A');
      const a = f.track(f.host.activateOnlineRoom('ROOM-A'));
      const b = f.track(f.host.activateOnlineRoom('ROOM-A'));
      await first.entered.promise;
      await vi.advanceTimersByTimeAsync(0);
      await f.host.stop();
      await startOnline(f, 'ROOM-B');
      await f.host.activateOnlineRoom('ROOM-B');
      const timerB = setInterval.mock.results.at(-1)?.value as ReturnType<typeof setInterval>;
      first.gate.resolve(undefined);
      second.gate.reject(new Error('REGISTRY_ACTIVATION_FAILED'));
      await Promise.allSettled([a, b]);
      const beforeRenew = f.host.status.onlineState;
      await vi.advanceTimersByTimeAsync(30_000);
      const observed = { state: beforeRenew, renewals: f.discovery.renew.mock.calls,
        clearedB: clearInterval.mock.calls.some(([timer]) => timer === timerB), timers: vi.getTimerCount() };
      expect(observed).toEqual({ state: 'READY', renewals: [['ROOM-B', 'credential-ROOM-B']], clearedB: false, timers: 1 });
      expect(f.connectivity.start).toHaveBeenCalledTimes(2);
    } finally { await f.cleanup(); }
  });

  it('004-E control: concurrent current activations keep exactly one valid renewal loop', async () => {
    const f = lifecycleFixture();
    const first = pendingActivation(f);
    const second = pendingActivation(f);
    try {
      await startOnline(f, 'ROOM-A');
      const a = f.track(f.host.activateOnlineRoom('ROOM-A'));
      const b = f.track(f.host.activateOnlineRoom('ROOM-A'));
      await first.entered.promise;
      await vi.advanceTimersByTimeAsync(0);
      first.gate.resolve(undefined);
      second.gate.resolve(undefined);
      await Promise.all([a, b]);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(f.discovery.renew.mock.calls).toEqual([
        ['ROOM-A', 'credential-ROOM-A'], ['ROOM-A', 'credential-ROOM-A'],
      ]);
      expect(f.host.status).toMatchObject({ state: 'HOSTING', onlineState: 'READY',
        onlineEndpoint: 'https://lifecycle-1.trycloudflare.com' });
      expect(f.helpers[0].start).toHaveBeenCalledOnce();
      expect(f.helpers[0].stop).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
  });
});
