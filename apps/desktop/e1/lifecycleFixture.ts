import path from 'node:path';
import { vi } from 'vitest';
import type { RoomDiscoveryProvider } from '../src/online/discovery';
import type { ConnectivityProvider } from '../src/online/connectivity';
import { HostRuntimeController, type HostRuntimeOptions, type HostRuntimeStatus } from '../src/hostRuntime';

/** All I/O adapters are local mocks; public-looking hostnames are only passed to onlineFetch below. */
export function lifecycleFixture(overrides: Partial<HostRuntimeOptions> = {}) {
  const releases: Array<() => void> = [];
  const pending: Promise<unknown>[] = [];
  const statuses: HostRuntimeStatus[] = [];
  let nextPid = 0;
  let nextTunnel = 0;
  const helpers: ReturnType<typeof makeHelper>[] = [];
  const makeHelper = () => ({
    state: 'READY' as const,
    diagnostic: '',
    start: vi.fn(() => Promise.resolve({ host: '0.0.0.0', port: 43123, pid: ++nextPid })),
    stop: vi.fn(() => Promise.resolve()),
    setPublicEndpoints: vi.fn(),
  });
  const helperFactory = vi.fn(() => {
    const helper = makeHelper();
    helpers.push(helper);
    return helper;
  });
  const discovery = {
    reserve: vi.fn((code: string) => Promise.resolve({ credential: 'credential-' + code, proof: 'proof-' + code })),
    activate: vi.fn<RoomDiscoveryProvider['activate']>(() => Promise.resolve()),
    renew: vi.fn<RoomDiscoveryProvider['renew']>(() => Promise.resolve()),
    suspend: vi.fn<RoomDiscoveryProvider['suspend']>(() => Promise.resolve()),
    revoke: vi.fn<RoomDiscoveryProvider['revoke']>(() => Promise.resolve()),
    resolve: vi.fn<RoomDiscoveryProvider['resolve']>(() => Promise.resolve(null)),
  };
  const connectivity = {
    start: vi.fn<ConnectivityProvider['start']>(() => Promise.resolve(
      'https://lifecycle-' + String(++nextTunnel) + '.trycloudflare.com',
    )),
    stop: vi.fn(() => Promise.resolve()),
  };
  const routeProbe = vi.fn((): Promise<string | undefined> => Promise.resolve(undefined));
  const onlineFetch = vi.fn((url: string) => Promise.resolve(new Response(
    url.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>', { status: 200 },
  )));
  const host = new HostRuntimeController({
    helperPath: path.resolve('e1-mocked-helper.cjs'), clientDist: path.resolve('e1-mocked-client'),
    appVersion: '1.10.0', defaultPort: 43123, healthCheckIntervalMs: 0,
    interfaceProvider: () => [{ name: 'Wi-Fi', displayName: 'Wi-Fi', address: '192.168.1.15',
      netmask: '255.255.255.0', preference: 'preferred', rank: 0 }],
    helperFactory, discovery, connectivity, routeProbe, onlineFetch, ...overrides,
  });
  const removeListener = host.onStatusChanged(status => statuses.push(status));
  function deferred<T>(fallback: T) {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    // A future fix may coalesce calls and leave a rejected secondary gate unconsumed.
    // Observe it immediately without changing the original rejection seen by real consumers.
    void promise.catch(() => undefined);
    // Cleanup releases every barrier even if a correctness assertion fails early.
    releases.push(() => resolve(fallback));
    return { promise, resolve, reject };
  }
  function track<T>(promise: Promise<T>): Promise<T> {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  }
  async function cleanup() {
    try {
      releases.forEach(release => release());
      await Promise.allSettled(pending);
      await host.stop();
    } finally {
      removeListener();
      // No timer survives a failing assertion or a stopped-host idle fast path.
      vi.clearAllTimers();
    }
  }
  return { host, helperFactory, helpers, discovery, connectivity, routeProbe, onlineFetch, statuses, deferred, track, cleanup };
}
