import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostRuntimeController } from '../hostRuntime';

afterEach(() => vi.unstubAllGlobals());

describe('direct-link online host', () => {
  it('publishes a link only after the tunneled room can be reached without a registry', async () => {
    const helper = { state: 'READY' as const, diagnostic: '',
      start: vi.fn(() => Promise.resolve({ host: '0.0.0.0', port: 53120, pid: 1 })),
      stop: vi.fn(() => Promise.resolve()) };
    const connectivity = { start: vi.fn(() => Promise.resolve('https://room.trycloudflare.com')),
      stop: vi.fn(() => Promise.resolve()) };
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(new Response(
      input.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>', { status: 200 },
    ))));
    const host = new HostRuntimeController({
      helperPath: path.resolve('helper.cjs'), clientDist: path.resolve('dist'), appVersion: '1.4.1',
      interfaceProvider: () => [], helperFactory: () => helper, connectivity,
    });
    try {
      const started = await host.start({ mode: 'ONLINE', roomCode: 'OTB-ABC234' });
      expect(started.onlineState).toBe('AWAITING_ROOM');
      expect((await host.activateOnlineRoom('OTB-ABC234')).onlineState).toBe('READY');
    } finally {
      await host.stop();
    }
    expect(connectivity.stop).toHaveBeenCalledOnce();
    expect(helper.stop).toHaveBeenCalledOnce();
  });

  it('keeps the live match and replaces the invitation after tunnel loss', async () => {
    const helper = { state: 'READY' as const, diagnostic: '',
      start: vi.fn(() => Promise.resolve({ host: '0.0.0.0', port: 53120, pid: 1 })),
      stop: vi.fn(() => Promise.resolve()) };
    let onLost: (() => void) | undefined;
    const connectivity = {
      start: vi.fn((_local: string, lost: () => void) => {
        onLost = lost;
        return Promise.resolve(connectivity.start.mock.calls.length === 1
          ? 'https://first.trycloudflare.com' : 'https://second.trycloudflare.com');
      }),
      stop: vi.fn(() => Promise.resolve()),
    };
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(new Response(
      input.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>', { status: 200 },
    ))));
    const host = new HostRuntimeController({
      helperPath: path.resolve('helper.cjs'), clientDist: path.resolve('dist'), appVersion: '1.4.1',
      interfaceProvider: () => [], helperFactory: () => helper, connectivity,
    });
    try {
      await host.start({ mode: 'ONLINE', roomCode: 'OTB-ABC234' });
      await host.activateOnlineRoom('OTB-ABC234');
      onLost?.();
      await vi.waitFor(() => expect(host.status.onlineEndpoint).toBe('https://second.trycloudflare.com'));
      await vi.waitFor(() => expect(host.status.onlineState).toBe('READY'));
      expect(host.status.state).toBe('HOSTING');
      expect(helper.stop).not.toHaveBeenCalled();
    } finally { await host.stop(); }
  });

  it('treats a helper crash as terminal and stops the tunnel', async () => {
    let exited: ((diagnostic: string) => void) | undefined;
    const helper = { state: 'READY' as const, diagnostic: '',
      start: vi.fn(() => Promise.resolve({ host: '0.0.0.0', port: 53120, pid: 1 })),
      stop: vi.fn(() => Promise.resolve()),
      onUnexpectedExit: vi.fn((listener: (diagnostic: string) => void) => { exited = listener; return () => undefined; }),
    };
    const connectivity = { start: vi.fn(() => Promise.resolve('https://room.trycloudflare.com')),
      stop: vi.fn(() => Promise.resolve()) };
    vi.stubGlobal('fetch', vi.fn((input: string) => Promise.resolve(new Response(
      input.endsWith('/readyz') ? 'ready' : '<html>Own the Block</html>', { status: 200 },
    ))));
    const host = new HostRuntimeController({
      helperPath: path.resolve('helper.cjs'), clientDist: path.resolve('dist'), appVersion: '1.4.1',
      interfaceProvider: () => [], helperFactory: () => helper, connectivity,
    });
    await host.start({ mode: 'ONLINE', roomCode: 'OTB-ABC234' });
    exited?.('server helper exited unexpectedly');
    await vi.waitFor(() => expect(host.status.state).toBe('FAILED'));
    expect(host.status.onlineEndpoint).toBeNull();
    expect(connectivity.stop).toHaveBeenCalled();
    expect(helper.start).toHaveBeenCalledOnce();
  });
});
