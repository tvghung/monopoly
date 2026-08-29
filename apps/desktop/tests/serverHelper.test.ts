import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  utilityProcess: { fork: vi.fn() },
}));

import type { UtilityProcess } from 'electron';
import {
  ServerHelperController,
  type ServerHelperFork,
} from '../src/serverHelper';

class FakeUtilityProcess extends EventEmitter {
  readonly pid = 7317;
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly postMessage = vi.fn((message: unknown) => {
    if (typeof message === 'object' && message !== null
      && (message as { type?: string }).type === 'shutdown') {
      queueMicrotask(() => this.emit('exit', 0));
    }
  });
  readonly kill = vi.fn(() => {
    this.emit('exit', 1);
    return true;
  });
}

describe('server helper controller', () => {
  afterEach(() => vi.restoreAllMocks());

  it('forks one helper for concurrent starts and keeps the URL in env only', async () => {
    const child = new FakeUtilityProcess();
    const fork = vi.fn<ServerHelperFork>((_modulePath, _args, options) => {
      queueMicrotask(() => child.emit('message', { type: 'ready', host: '127.0.0.1', port: 43123 }));
      expect(options.env.DATABASE_URL).toContain('own_the_block');
      return child as unknown as UtilityProcess;
    });
    const controller = new ServerHelperController({
      modulePath: 'C:\\proof\\server-helper.cjs',
      migrationDirectory: 'C:\\proof\\migrations',
      databaseUrl: 'postgresql://postgres@127.0.0.1:43122/own_the_block',
      host: '127.0.0.1',
      port: 43123,
      fork,
      fetch: vi.fn(async (url: string) => new Response(
        url.endsWith('/readyz') ? 'ready' : 'ok',
        { status: 200 },
      )),
    });

    const [first, second] = await Promise.all([controller.start(), controller.start()]);
    expect(fork).toHaveBeenCalledOnce();
    expect(first).toEqual(second);
    expect(fork.mock.calls[0]?.[1]).toEqual([]);
    expect(controller.state).toBe('READY');
    await controller.stop();
    expect(child.postMessage).toHaveBeenCalledWith({ type: 'shutdown' });
    expect(controller.state).toBe('STOPPED');
  });

  it('fails when the helper exits before readiness', async () => {
    const child = new FakeUtilityProcess();
    const fork = vi.fn<ServerHelperFork>(() => {
      queueMicrotask(() => child.emit('exit', 1));
      return child as unknown as UtilityProcess;
    });
    const controller = new ServerHelperController({
      modulePath: 'C:\\proof\\server-helper.cjs',
      migrationDirectory: 'C:\\proof\\migrations',
      databaseUrl: 'postgresql://postgres@127.0.0.1:43122/own_the_block',
      host: '127.0.0.1',
      port: 43123,
      fork,
    });

    await expect(controller.start()).rejects.toThrow('exited before readiness');
    expect(controller.state).toBe('FAILED');
  });

  it('fails on a bounded readiness timeout', async () => {
    const child = new FakeUtilityProcess();
    const fork = vi.fn<ServerHelperFork>(() => child as unknown as UtilityProcess);
    const controller = new ServerHelperController({
      modulePath: 'C:\\proof\\server-helper.cjs',
      migrationDirectory: 'C:\\proof\\migrations',
      databaseUrl: 'postgresql://postgres@127.0.0.1:43122/own_the_block',
      host: '127.0.0.1',
      port: 43123,
      startupTimeoutMs: 20,
      fork,
    });

    await expect(controller.start()).rejects.toThrow('readiness timed out');
    expect(child.kill).toHaveBeenCalledOnce();
    expect(controller.state).toBe('FAILED');
  });
});
