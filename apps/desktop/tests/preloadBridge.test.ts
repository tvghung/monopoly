import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(() => Promise.resolve(undefined)),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, api: unknown) => {
      harness.exposed.set(name, api);
    }),
  },
  ipcRenderer: {
    invoke: harness.invoke,
    send: harness.send,
    on: harness.on,
    removeListener: harness.removeListener,
  },
}));

import { IPC_CHANNELS } from '../src/ipc/channels';

interface Bridge {
  getRuntimeConfig(): Promise<unknown>;
  window: Record<string, (...args: unknown[]) => unknown>;
  quit: Record<string, (...args: unknown[]) => unknown>;
  openExternal(url: string): Promise<unknown>;
  host: Record<string, (...args: unknown[]) => unknown>;
  lan: Record<string, (...args: unknown[]) => unknown>;
  online: Record<string, (...args: unknown[]) => unknown>;
  update: Record<string, (...args: unknown[]) => unknown>;
}

let bridge: Bridge;

beforeAll(async () => {
  await import('../src/preload');
  bridge = harness.exposed.get('ownTheBlockDesktop') as Bridge;
});

beforeEach(() => {
  harness.invoke.mockClear();
  harness.send.mockClear();
  harness.on.mockClear();
  harness.removeListener.mockClear();
});

describe('preload bridge contract', () => {
  it('exposes one typed object and never the raw IPC renderer', () => {
    expect([...harness.exposed.keys()]).toEqual(['ownTheBlockDesktop']);
    expect(Object.keys(bridge).sort()).toEqual(['getRuntimeConfig', 'host', 'lan', 'online', 'openExternal', 'quit', 'update', 'window']);
    const names = [
      ...Object.keys(bridge),
      ...Object.values(bridge)
        .filter((value): value is Record<string, unknown> => typeof value === 'object' && value !== null)
        .flatMap(group => Object.keys(group)),
    ];
    for (const raw of ['ipcRenderer', 'invoke', 'send', 'on', 'removeListener']) expect(names).not.toContain(raw);
  });

  it('keeps the quit group to the renderer answers, the dialog acknowledgement and the confirmed exit', () => {
    expect(Object.keys(bridge.quit).sort()).toEqual(['acknowledge', 'exitApp', 'onQuitRequested', 'respond']);
  });

  it('asks the main process to quit through its own channel, with no payload', async () => {
    await bridge.quit.exitApp();

    expect(harness.invoke).toHaveBeenCalledExactlyOnceWith(IPC_CHANNELS.quitExit);
    expect(IPC_CHANNELS.quitExit).toBe('ownTheBlock:quit:exit');
    expect(harness.send).not.toHaveBeenCalled();
  });

  it('keeps the update group to five calls and one listener, none of which takes an argument', async () => {
    expect(Object.keys(bridge.update).sort()).toEqual(['cancelDownload', 'check', 'download', 'getState', 'install', 'onStateChanged']);

    // Even when a caller passes something along, the bridge sends the bare channel: no URL, path or version can be chosen.
    for (const call of ['getState', 'check', 'download', 'cancelDownload', 'install'] as const) {
      harness.invoke.mockClear();
      await bridge.update[call]('https://evil.example/Setup.exe');
      expect(harness.invoke).toHaveBeenCalledExactlyOnceWith(
        { getState: IPC_CHANNELS.updateGetState, check: IPC_CHANNELS.updateCheck, download: IPC_CHANNELS.updateDownload,
          cancelDownload: IPC_CHANNELS.updateCancel, install: IPC_CHANNELS.updateInstall }[call],
      );
    }
  });

  it('subscribes to pushed update states and unsubscribes exactly that listener', () => {
    const listener = vi.fn();

    const unsubscribe = bridge.update.onStateChanged(listener) as () => void;
    const [channel, handler] = harness.on.mock.calls.at(-1) as unknown as [string, (event: unknown, state: unknown) => void];
    expect(channel).toBe(IPC_CHANNELS.updateStateChanged);
    handler({}, { phase: 'ready' });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ phase: 'ready' });

    unsubscribe();
    expect(harness.removeListener).toHaveBeenCalledExactlyOnceWith(IPC_CHANNELS.updateStateChanged, handler);
  });

  it('speaks only on channels the main process knows', async () => {
    const known = new Set<string>(Object.values(IPC_CHANNELS));

    await bridge.getRuntimeConfig();
    await bridge.window.getState?.();
    await bridge.window.setFullscreen?.(true);
    await bridge.window.toggleFullscreen?.();
    (bridge.window.onFullscreenChanged?.(() => undefined) as () => void)();
    (bridge.quit.onQuitRequested?.(() => undefined) as () => void)();
    bridge.quit.respond?.('00000000-0000-4000-8000-000000000000', true);
    bridge.quit.acknowledge?.('00000000-0000-4000-8000-000000000000');
    await bridge.quit.exitApp?.();
    await bridge.openExternal('https://example.com');
    await bridge.host.getStatus?.();
    await bridge.host.start?.();
    await bridge.host.stop?.();
    await bridge.host.refreshNetwork?.();
    (bridge.host.onStatusChanged?.(() => undefined) as () => void)();
    await bridge.lan.findRoom?.('OTB-ABC234');
    await bridge.update.getState?.();
    await bridge.update.check?.();
    await bridge.update.download?.();
    await bridge.update.cancelDownload?.();
    await bridge.update.install?.();
    (bridge.update.onStateChanged?.(() => undefined) as () => void)();

    const used = [
      ...harness.invoke.mock.calls.map(call => (call as unknown[])[0]),
      ...harness.send.mock.calls.map(call => (call as unknown[])[0]),
      ...harness.on.mock.calls.map(call => (call as unknown[])[0]),
    ];
    expect(used.length).toBeGreaterThan(10);
    for (const channel of used) expect(known.has(channel as string)).toBe(true);
  });
});
