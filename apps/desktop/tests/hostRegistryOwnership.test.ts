import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HostRuntimeController, type HostRuntimeStatus } from '../src/hostRuntime';
import type { ConnectivityProvider } from '../src/online/connectivity';
import type { RoomDiscoveryProvider } from '../src/online/discovery';
import type { OnlineFetcher } from '../src/online/probe';

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }));

function deferred<T>(fallback: T) {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject, release: () => resolve(fallback) };
}

/** All registry, helper and tunnel effects stay in these local adapters. */
function fixture(sameEndpoint = false) {
  const statuses: HostRuntimeStatus[] = [];
  const pending: Promise<unknown>[] = [];
  const releases: Array<() => void> = [];
  const lost: Array<() => void> = [];
  let credentialSequence = 0;
  const helpers: Array<ReturnType<typeof makeHelper>> = [];
  function makeHelper() {
    return { state: 'READY' as const, diagnostic: '',
      start: vi.fn(async () => ({ host: '0.0.0.0', port: 43123, pid: helpers.length })),
      stop: vi.fn(async () => undefined), setPublicEndpoints: vi.fn() };
  }
  const discovery = {
    reserve: vi.fn<RoomDiscoveryProvider['reserve']>(async code => {
      credentialSequence += 1;
      return { credential: 'credential-' + code + '-' + String(credentialSequence),
        proof: 'proof-' + code + '-' + String(credentialSequence) };
    }),
    activate: vi.fn<RoomDiscoveryProvider['activate']>(async () => undefined),
    renew: vi.fn<RoomDiscoveryProvider['renew']>(async () => undefined),
    suspend: vi.fn<RoomDiscoveryProvider['suspend']>(async () => undefined),
    revoke: vi.fn<RoomDiscoveryProvider['revoke']>(async () => undefined),
    resolve: vi.fn<RoomDiscoveryProvider['resolve']>(async () => null),
  };
  const connectivity = {
    start: vi.fn<ConnectivityProvider['start']>(async (_origin, onLost) => {
      lost.push(onLost);
      return 'https://registry-' + String(sameEndpoint ? 1 : lost.length) + '.trycloudflare.com';
    }),
    stop: vi.fn(async () => undefined),
  };
  const onlineFetch = vi.fn<OnlineFetcher>(async url => new Response(
    url.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>', { status: 200 },
  ));
  const host = new HostRuntimeController({ helperPath: path.resolve('mocked-registry-helper.cjs'),
    clientDist: path.resolve('mocked-registry-client'), appVersion: '1.10.0', defaultPort: 43123,
    healthCheckIntervalMs: 0, interfaceProvider: () => [], discovery, connectivity, onlineFetch,
    helperFactory: () => { const helper = makeHelper(); helpers.push(helper); return helper; } });
  const remove = host.onStatusChanged(status => statuses.push(status));
  function gate<T>(fallback: T) {
    const result = deferred(fallback);
    releases.push(result.release);
    return result;
  }
  function track<T>(promise: Promise<T>): Promise<T> {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  }
  function waitForStatus(predicate: (status: HostRuntimeStatus) => boolean) {
    if (predicate(host.status)) return Promise.resolve(host.status);
    const ready = gate(host.status);
    const removeStatus = host.onStatusChanged(status => {
      if (predicate(status)) { removeStatus(); ready.resolve(status); }
    });
    return ready.promise;
  }
  async function cleanup() {
    releases.forEach(release => release());
    await Promise.allSettled(pending);
    await host.stop().catch(() => undefined);
    remove();
  }
  const result = { host, statuses, helpers, discovery, connectivity, onlineFetch, lost, gate, track,
    waitForStatus, cleanup, start: (code: string) => track(host.start({ mode: 'ONLINE', roomCode: code })) };
  fixtures.push(result);
  return result;
}

type Fixture = ReturnType<typeof fixture>;
const fixtures: Array<{ cleanup(): Promise<void> }> = [];
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.cleanup();
  vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
});

function activationGate(f: Fixture) {
  const entered = f.gate(undefined);
  const gate = f.gate(undefined);
  f.discovery.activate.mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise; });
  return { entered, gate };
}

function renewalGate(f: Fixture) {
  const entered = f.gate(undefined);
  const gate = f.gate(undefined);
  f.discovery.renew.mockImplementationOnce(() => { entered.resolve(undefined); return gate.promise; });
  return { entered, gate };
}

function finish(gate: { resolve(value: undefined): void; reject(reason: unknown): void }, outcome: 'resolve' | 'reject') {
  if (outcome === 'resolve') gate.resolve(undefined);
  else gate.reject(new Error('REGISTRY_DELAYED_FAILURE'));
}

async function activate(f: Fixture, code: string) { await f.track(f.host.activateOnlineRoom(code)); }

function publicRoomGate(f: Fixture, boundary: 'fetch' | 'body') {
  const entered = f.gate(undefined);
  const gate = f.gate(undefined);
  let signal: AbortSignal | null | undefined;
  const defaultFetch = f.onlineFetch.getMockImplementation()!;
  f.onlineFetch.mockImplementation((url, init) => {
    if (!url.includes('/_otb/room?')) return defaultFetch(url, init);
    signal = init?.signal;
    if (boundary === 'fetch') {
      entered.resolve(undefined);
      // Deliberately ignores the aborted signal and completes only when the test releases it.
      return gate.promise.then(() => new Response('room', { status: 200 }));
    }
    return Promise.resolve(new Response(new ReadableStream({
      cancel: () => { entered.resolve(undefined); return gate.promise; },
    }), { status: 200 }));
  });
  return { entered, gate, signal: () => signal };
}

describe('E1-FIX-004 registry continuation ownership', () => {
  it.each([
    ['resolve', 'resolve'], ['resolve', 'reject'], ['reject', 'resolve'], ['reject', 'reject'],
  ] as const)('keeps C isolated when obsolete A/B activations finish %s/%s', async (outcomeA, outcomeB) => {
    const f = fixture();
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    await f.start('ROOM-A');
    const a = activationGate(f);
    const pendingA = f.track(f.host.activateOnlineRoom('ROOM-A'));
    await a.entered.promise;
    await f.host.stop();
    await f.start('ROOM-B');
    const b = activationGate(f);
    const pendingB = f.track(f.host.activateOnlineRoom('ROOM-B'));
    await b.entered.promise;
    await f.host.stop();
    await f.start('ROOM-C');
    await activate(f, 'ROOM-C');
    const current = f.host.status;
    const count = f.statuses.length;
    const timer = setInterval.mock.results.at(-1)?.value;
    const timerWrites = setInterval.mock.calls.length;
    finish(a.gate, outcomeA); finish(b.gate, outcomeB);
    await Promise.allSettled([pendingA, pendingB]);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(current);
    expect(f.statuses.slice(count)).toEqual([]);
    expect(setInterval).toHaveBeenCalledTimes(timerWrites);
    expect(clearInterval.mock.calls.some(([value]) => value === timer)).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew.mock.calls).toEqual([['ROOM-C', 'credential-ROOM-C-3']]);
    expect(f.discovery.revoke.mock.calls).toEqual([
      ['ROOM-A', 'credential-ROOM-A-1'], ['ROOM-B', 'credential-ROOM-B-2'],
    ]);
    expect(f.helpers[2].stop).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)('isolates a reused room and endpoint from an old activation %s', async outcome => {
    const f = fixture(true);
    await f.start('SAME-ROOM');
    const old = activationGate(f);
    const obsolete = f.track(f.host.activateOnlineRoom('SAME-ROOM'));
    await old.entered.promise;
    await f.host.stop();
    await f.start('SAME-ROOM');
    await activate(f, 'SAME-ROOM');
    const current = f.host.status;
    const count = f.statuses.length;
    finish(old.gate, outcome);
    await Promise.allSettled([obsolete]);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(current);
    expect(f.statuses.slice(count)).toEqual([]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew.mock.calls).toEqual([['SAME-ROOM', 'credential-SAME-ROOM-2']]);
    expect(f.discovery.revoke.mock.calls).toEqual([['SAME-ROOM', 'credential-SAME-ROOM-1']]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(['resolve', 'reject'] as const)('keeps C isolated from a pending A renewal %s', async outcome => {
    const f = fixture();
    await f.start('RENEW-A'); await activate(f, 'RENEW-A');
    const old = renewalGate(f);
    await vi.advanceTimersByTimeAsync(30_000); await old.entered.promise;
    await f.host.stop();
    await f.start('RENEW-B'); await activate(f, 'RENEW-B'); await f.host.stop();
    await f.start('RENEW-C'); await activate(f, 'RENEW-C');
    const current = f.host.status;
    const count = f.statuses.length;
    finish(old.gate, outcome); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(current);
    expect(f.statuses.slice(count)).toEqual([]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew.mock.calls).toEqual([
      ['RENEW-A', 'credential-RENEW-A-1'], ['RENEW-C', 'credential-RENEW-C-3'],
    ]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(['resolve', 'reject'] as const)('detaches Stop from a pending activation %s without late writes', async outcome => {
    const f = fixture();
    await f.start('STOP-ACTIVATE');
    const old = activationGate(f);
    const pending = f.track(f.host.activateOnlineRoom('STOP-ACTIVATE'));
    await old.entered.promise;
    // Stop must settle while the adapter is still blocked on gate.promise.
    await f.host.stop();
    expect(f.host.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null, onlineState: undefined });
    expect(f.host.isBusy).toBe(false);
    const stopped = f.host.status;
    const count = f.statuses.length;
    finish(old.gate, outcome); await Promise.allSettled([pending]); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(stopped);
    expect(f.statuses.slice(count)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.discovery.revoke.mock.calls).toEqual([['STOP-ACTIVATE', 'credential-STOP-ACTIVATE-1']]);
  });

  it.each(['fetch', 'body'] as const)('rejects stale successful room probing after deferred %s completion', async boundary => {
    const f = fixture(true);
    await f.start('PROBE-OLD');
    const old = publicRoomGate(f, boundary);
    const pending = f.track(f.host.activateOnlineRoom('PROBE-OLD'));
    await old.entered.promise;
    await f.host.stop();
    expect(old.signal()?.aborted).toBe(true);
    f.onlineFetch.mockImplementation(async url => new Response(url.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>'));
    await f.start('PROBE-NEW'); await activate(f, 'PROBE-NEW');
    const current = f.host.status;
    const count = f.statuses.length;
    old.gate.resolve(undefined); await Promise.allSettled([pending]); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(current);
    expect(f.statuses.slice(count)).toEqual([]);
    expect(f.discovery.activate.mock.calls).toEqual([
      ['PROBE-NEW', 'credential-PROBE-NEW-2', 'https://registry-1.trycloudflare.com'],
    ]);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(['fetch', 'body'] as const)('ignores stale rejected room %s cleanup after Stop', async boundary => {
    const f = fixture();
    await f.start('PROBE-REJECT');
    const old = publicRoomGate(f, boundary);
    const pending = f.track(f.host.activateOnlineRoom('PROBE-REJECT'));
    await old.entered.promise;
    await f.host.stop();
    const stopped = f.host.status;
    const count = f.statuses.length;
    old.gate.reject(new Error('obsolete body or fetch failed'));
    await Promise.allSettled([pending]); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(stopped);
    expect(f.statuses.slice(count)).toEqual([]);
    expect(f.discovery.activate).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['PUBLIC_ROOM', 'READY'] as const)('honors reentrant Stop from %s status before registry or timer mutation', async boundary => {
    const f = fixture();
    await f.start('REENTRANT');
    let stopping: Promise<HostRuntimeStatus> | undefined;
    const remove = f.host.onStatusChanged(status => {
      const reached = boundary === 'PUBLIC_ROOM'
        ? status.onlineDiagnostic?.stage === 'PUBLIC_ROOM' && status.onlineDiagnostic.outcome === 'PASSED'
        : status.onlineState === 'READY';
      if (reached && !stopping) { remove(); stopping = f.host.stop(); }
    });
    const pending = f.track(f.host.activateOnlineRoom('REENTRANT'));
    await Promise.allSettled([pending]);
    expect(stopping).toBeDefined();
    await stopping;
    expect(f.host.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null, onlineState: undefined });
    expect(f.discovery.activate).toHaveBeenCalledTimes(boundary === 'PUBLIC_ROOM' ? 0 : 1);
    expect(f.discovery.renew).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(f.host.isBusy).toBe(false);
  });

  it('coalesces current concurrent activations and retains one credential-owned renewal loop', async () => {
    const f = fixture();
    await f.start('COALESCED');
    const current = activationGate(f);
    const first = f.track(f.host.activateOnlineRoom('COALESCED'));
    const second = f.track(f.host.activateOnlineRoom('COALESCED'));
    await current.entered.promise;
    expect(f.discovery.activate).toHaveBeenCalledOnce();
    current.gate.resolve(undefined);
    const statuses = await Promise.all([first, second]);
    expect(statuses[0]).toEqual(statuses[1]);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.discovery.renew.mock.calls).toEqual([
      ['COALESCED', 'credential-COALESCED-1'], ['COALESCED', 'credential-COALESCED-1'],
    ]);
  });

  it('retries an active failed activation and preserves working endpoint and credential', async () => {
    const f = fixture();
    await f.start('RETRY');
    f.discovery.activate.mockRejectedValueOnce(new Error('REGISTRY_ACTIVATION_FAILED'));
    await activate(f, 'RETRY');
    expect(f.host.status).toMatchObject({ onlineState: 'DISCOVERY_UNAVAILABLE', onlineEndpoint: 'https://registry-1.trycloudflare.com' });
    await activate(f, 'RETRY');
    expect(f.host.status.onlineState).toBe('READY');
    expect(f.discovery.activate.mock.calls).toEqual([
      ['RETRY', 'credential-RETRY-1', 'https://registry-1.trycloudflare.com'],
      ['RETRY', 'credential-RETRY-1', 'https://registry-1.trycloudflare.com'],
    ]);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew).toHaveBeenCalledExactlyOnceWith('RETRY', 'credential-RETRY-1');
  });

  it.each(['resolve', 'reject'] as const)('skips overlapping ticks while a current renewal is pending, then recovers after %s', async outcome => {
    const f = fixture();
    await f.start('SLOW-RENEW'); await activate(f, 'SLOW-RENEW');
    const current = renewalGate(f);
    await vi.advanceTimersByTimeAsync(90_000); await current.entered.promise;
    expect(f.discovery.renew).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(1);
    finish(current.gate, outcome); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status.onlineState).toBe(outcome === 'resolve' ? 'READY' : 'DISCOVERY_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew.mock.calls).toEqual([
      ['SLOW-RENEW', 'credential-SLOW-RENEW-1'], ['SLOW-RENEW', 'credential-SLOW-RENEW-1'],
    ]);
    expect(f.host.status.onlineState).toBe('READY');
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(['resolve', 'reject'] as const)('invalidates the old renewal loop after same-lifecycle reactivation before %s', async outcome => {
    const f = fixture();
    await f.start('REACTIVATE'); await activate(f, 'REACTIVATE');
    const old = renewalGate(f);
    await vi.advanceTimersByTimeAsync(30_000); await old.entered.promise;
    if (outcome === 'resolve') f.discovery.activate.mockRejectedValueOnce(new Error('REGISTRY_ACTIVATION_FAILED'));
    await activate(f, 'REACTIVATE');
    const current = f.host.status;
    const count = f.statuses.length;
    finish(old.gate, outcome); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(current);
    expect(f.statuses.slice(count)).toEqual([]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew.mock.calls).toEqual([
      ['REACTIVATE', 'credential-REACTIVATE-1'], ['REACTIVATE', 'credential-REACTIVATE-1'],
    ]);
    expect(f.host.status.onlineState).toBe('READY');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('keeps discovery fallback for a current failure and restores READY on the next renewal', async () => {
    const f = fixture();
    await f.start('FALLBACK');
    f.discovery.activate.mockRejectedValueOnce(new Error('REGISTRY_ACTIVATION_FAILED'));
    await activate(f, 'FALLBACK');
    expect(f.host.status).toMatchObject({ state: 'HOSTING', onlineState: 'DISCOVERY_UNAVAILABLE', onlineEndpoint: 'https://registry-1.trycloudflare.com' });
    f.discovery.renew.mockRejectedValueOnce(new Error('REGISTRY_RENEW_FAILED'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.host.status.onlineState).toBe('DISCOVERY_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.host.status.onlineState).toBe('READY');
    expect(f.helpers[0].stop).not.toHaveBeenCalled();
    expect(f.connectivity.stop).not.toHaveBeenCalled();
  });

  it('keeps a link usable when reservation fails without inventing a renewal credential', async () => {
    const f = fixture();
    f.discovery.reserve.mockRejectedValueOnce(new Error('REGISTRY_UNAVAILABLE'));
    await f.start('NO-LEASE'); await activate(f, 'NO-LEASE');
    expect(f.host.status).toMatchObject({ state: 'HOSTING', onlineState: 'DISCOVERY_UNAVAILABLE', onlineEndpoint: 'https://registry-1.trycloudflare.com' });
    expect(f.discovery.activate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.discovery.renew).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['resolve', 'reject'] as const)('preserves a replacement tunnel endpoint after obsolete activation %s', async outcome => {
    const f = fixture();
    await f.start('ENDPOINT');
    const old = activationGate(f);
    const pending = f.track(f.host.activateOnlineRoom('ENDPOINT'));
    await old.entered.promise;
    const replacement = f.waitForStatus(status => status.onlineEndpoint === 'https://registry-2.trycloudflare.com');
    f.lost[0](); await replacement;
    await activate(f, 'ENDPOINT');
    const current = f.host.status;
    const count = f.statuses.length;
    finish(old.gate, outcome); await Promise.allSettled([pending]); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(current);
    expect(f.statuses.slice(count)).toEqual([]);
    expect(f.helpers[0].setPublicEndpoints.mock.calls).toEqual([
      [['https://registry-1.trycloudflare.com']], [[]], [['https://registry-2.trycloudflare.com']],
    ]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew).toHaveBeenCalledExactlyOnceWith('ENDPOINT', 'credential-ENDPOINT-1');
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(['resolve', 'reject'] as const)('cancels automatic tunnel recovery without waiting for blocked registry %s', async outcome => {
    const f = fixture();
    await f.start('RECOVERY-STOP'); await activate(f, 'RECOVERY-STOP');
    const recovery = activationGate(f);
    f.lost[0](); await recovery.entered.promise;
    expect(f.host.status.onlineEndpoint).toBe('https://registry-2.trycloudflare.com');
    await f.host.stop();
    expect(f.host.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null });
    expect(f.host.isBusy).toBe(false);
    const stopped = f.host.status;
    const count = f.statuses.length;
    finish(recovery.gate, outcome); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(stopped);
    expect(f.statuses.slice(count)).toEqual([]);
    expect(f.discovery.revoke.mock.calls).toEqual([['RECOVERY-STOP', 'credential-RECOVERY-STOP-1']]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['helper', 'tunnel'] as const)('retains failed %s cleanup ownership while ignoring obsolete registry completion', async resource => {
    const f = fixture();
    await f.start('CLEANUP-OLD');
    const old = activationGate(f);
    const pending = f.track(f.host.activateOnlineRoom('CLEANUP-OLD'));
    await old.entered.promise;
    const stoppingResource = resource === 'helper' ? f.helpers[0].stop : f.connectivity.stop;
    stoppingResource.mockRejectedValueOnce(new Error(resource + ' cleanup failed'));
    await expect(f.host.stop()).rejects.toThrow(resource + ' cleanup failed');
    expect(f.host.status.state).toBe('FAILED');
    expect(f.host.isBusy).toBe(true);
    const failed = f.host.status;
    const count = f.statuses.length;
    old.gate.resolve(undefined); await Promise.allSettled([pending]); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(failed);
    expect(f.statuses.slice(count)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    await f.host.stop();
    expect(f.host.isBusy).toBe(false);
    await f.start('CLEANUP-NEW'); await activate(f, 'CLEANUP-NEW');
    expect(f.helpers).toHaveLength(2);
    expect(f.helpers[1].stop).not.toHaveBeenCalled();
    expect(f.discovery.revoke.mock.calls).toEqual([['CLEANUP-OLD', 'credential-CLEANUP-OLD-1']]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew).toHaveBeenCalledExactlyOnceWith('CLEANUP-NEW', 'credential-CLEANUP-NEW-2');
  });

  it.each(['activate', 'renew'] as const)('observes synchronous %s adapter failure after reentrant Stop', async action => {
    const f = fixture();
    await f.start('SYNC-STOP');
    let stopping: Promise<HostRuntimeStatus> | undefined;
    const failAfterStop = () => {
      stopping = f.host.stop();
      throw new Error('synchronous registry failure after Stop');
    };
    if (action === 'activate') {
      f.discovery.activate.mockImplementationOnce(failAfterStop);
      await Promise.allSettled([f.track(f.host.activateOnlineRoom('SYNC-STOP'))]);
    } else {
      await activate(f, 'SYNC-STOP');
      f.discovery.renew.mockImplementationOnce(failAfterStop);
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(stopping).toBeDefined();
    await stopping;
    const stopped = f.host.status;
    const count = f.statuses.length;
    await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(stopped);
    expect(f.host.status).toMatchObject({ state: 'IDLE', onlineEndpoint: null, onlineState: undefined });
    expect(f.statuses.slice(count)).toEqual([]);
    expect(f.host.isBusy).toBe(false);
    expect(f.discovery.revoke.mock.calls).toEqual([['SYNC-STOP', 'credential-SYNC-STOP-1']]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps best-effort failed revocation scoped to its old credential during replacement', async () => {
    const f = fixture(true);
    await f.start('REVOKE');
    const old = activationGate(f);
    const pending = f.track(f.host.activateOnlineRoom('REVOKE'));
    await old.entered.promise;
    f.discovery.revoke.mockRejectedValueOnce(new Error('REGISTRY_UNAVAILABLE'));
    await f.host.stop();
    await f.start('REVOKE'); await activate(f, 'REVOKE');
    const current = f.host.status;
    const count = f.statuses.length;
    old.gate.resolve(undefined); await Promise.allSettled([pending]); await vi.advanceTimersByTimeAsync(0);
    expect(f.host.status).toEqual(current);
    expect(f.statuses.slice(count)).toEqual([]);
    expect(f.discovery.revoke.mock.calls).toEqual([['REVOKE', 'credential-REVOKE-1']]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.discovery.renew).toHaveBeenCalledExactlyOnceWith('REVOKE', 'credential-REVOKE-2');
    // The adapter rejected revocation: these assertions establish local isolation, not remote cleanup.
    expect(vi.getTimerCount()).toBe(1);
  });
});
