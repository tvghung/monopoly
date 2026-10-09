import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
}));

import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { QuitRequestController } from '../src/ipc/windowHandlers';
import { IPC_CHANNELS } from '../src/ipc/channels';

describe('QuitRequestController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks the renderer before closing and does not leave on cancellation', () => {
    const preventDefault = vi.fn();
    const close = vi.fn();
    const send = vi.fn();
    const window = {
      close,
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow;
    const controller = new QuitRequestController(window);

    controller.handleClose({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    const requestId = send.mock.calls[0]?.[1] as string;
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.quitRequested, requestId);
    controller.respond(requestId, false);
    expect(close).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('allows exactly one confirmed close and falls back after a renderer timeout', () => {
    const close = vi.fn();
    const send = vi.fn();
    const window = {
      close,
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow;
    const controller = new QuitRequestController(window);

    controller.handleClose({ preventDefault: vi.fn() });
    const requestId = send.mock.calls[0]?.[1] as string;
    controller.respond(requestId, true);
    expect(close).toHaveBeenCalledOnce();

    controller.handleClose({ preventDefault: vi.fn() });
    controller.handleClose({ preventDefault: vi.fn() });
    vi.advanceTimersByTime(2_000);
    expect(close).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('uses the same renderer decision for an application quit and honors cancellation', async () => {
    const close = vi.fn();
    const send = vi.fn();
    const window = {
      close,
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow;
    const controller = new QuitRequestController(window);

    const first = controller.requestApplicationQuit();
    const second = controller.requestApplicationQuit();
    const requestId = send.mock.calls[0]?.[1] as string;
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.quitRequested, requestId);
    controller.respond(requestId, false);

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(close).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('fails open for an application quit when the renderer does not respond', async () => {
    const send = vi.fn();
    const window = {
      close: vi.fn(),
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow;
    const controller = new QuitRequestController(window);

    const decision = controller.requestApplicationQuit();
    vi.advanceTimersByTime(2_000);

    await expect(decision).resolves.toBe(true);
    expect(window.close).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('bypasses the final browser-window close after application quit approval', () => {
    const preventDefault = vi.fn();
    const send = vi.fn();
    const window = {
      close: vi.fn(),
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow;
    const controller = new QuitRequestController(window);

    controller.armNextClose();
    controller.handleClose({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    controller.dispose();
  });
});

describe('QuitRequestController while the player is being asked', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A window whose web contents can emit the lifecycle events the controller watches. */
  function setup() {
    const contents = Object.assign(new EventEmitter(), { send: vi.fn() });
    const close = vi.fn();
    const window = { close, isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow;
    const controller = new QuitRequestController(window);
    const ask = () => {
      controller.handleClose({ preventDefault: vi.fn() });
      return contents.send.mock.calls.at(-1)?.[1] as string;
    };
    return { controller, contents, close, ask };
  }

  it('keeps waiting past the old 2 s limit once the dialog is acknowledged', () => {
    const { controller, close, ask } = setup();
    const requestId = ask();

    controller.acknowledge(requestId);
    vi.advanceTimersByTime(60_000);

    expect(close).not.toHaveBeenCalled();
    controller.respond(requestId, true);
    expect(close).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('cancelling after a long wait keeps the window open and allows asking again', () => {
    const { controller, contents, close, ask } = setup();
    const first = ask();
    controller.acknowledge(first);
    vi.advanceTimersByTime(120_000);

    controller.respond(first, false);
    expect(close).not.toHaveBeenCalled();
    expect(contents.listenerCount('render-process-gone')).toBe(0);

    const second = ask();
    expect(second).not.toBe(first);
    expect(contents.send).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('still fails open when the renderer never says it is asking', () => {
    const { close, ask, controller } = setup();
    ask();

    vi.advanceTimersByTime(2_000);

    expect(close).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('ignores an acknowledgement for another or an already finished request', () => {
    const { controller, close, ask } = setup();
    const requestId = ask();

    controller.acknowledge('00000000-0000-4000-8000-000000000000');
    vi.advanceTimersByTime(2_000);
    expect(close).toHaveBeenCalledOnce();

    controller.acknowledge(requestId);
    expect(close).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('does not stack requests or watchers for repeated close attempts', () => {
    const { controller, contents, close, ask } = setup();
    const requestId = ask();
    controller.acknowledge(requestId);
    controller.acknowledge(requestId);

    controller.handleClose({ preventDefault: vi.fn() });
    controller.handleClose({ preventDefault: vi.fn() });

    expect(contents.send).toHaveBeenCalledOnce();
    expect(contents.listenerCount('render-process-gone')).toBe(1);
    expect(close).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('closes when the renderer process is gone, because nobody can answer any more', () => {
    const { controller, contents, close, ask } = setup();
    controller.acknowledge(ask());

    contents.emit('render-process-gone');

    expect(close).toHaveBeenCalledOnce();
    expect(contents.listenerCount('render-process-gone')).toBe(0);
    controller.dispose();
  });

  it('treats a reloaded page as a cancellation, not a confirmation', () => {
    const { controller, contents, close, ask } = setup();
    controller.acknowledge(ask());

    contents.emit('did-start-navigation', {}, 'app://x', true, false);
    expect(close).not.toHaveBeenCalled();
    controller.dispose();

    const again = setup();
    again.controller.acknowledge(again.ask());
    again.contents.emit('did-start-navigation', {}, 'app://x', false, true);
    expect(again.close).not.toHaveBeenCalled();
    expect(again.contents.listenerCount('did-start-navigation')).toBe(0);
    again.controller.dispose();
  });

  it('waits through a short freeze but gives up on a renderer that stays unresponsive', () => {
    const { controller, contents, close, ask } = setup();
    controller.acknowledge(ask());

    contents.emit('unresponsive');
    vi.advanceTimersByTime(10_000);
    contents.emit('responsive');
    vi.advanceTimersByTime(60_000);
    expect(close).not.toHaveBeenCalled();

    contents.emit('unresponsive');
    vi.advanceTimersByTime(30_000);
    expect(close).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it('a disposed controller answers an application quit with no and leaves nothing listening', async () => {
    const { controller, contents } = setup();
    const decision = controller.requestApplicationQuit();
    controller.acknowledge(contents.send.mock.calls[0]?.[1] as string);

    controller.dispose();

    await expect(decision).resolves.toBe(false);
    expect(contents.listenerCount('render-process-gone')).toBe(0);
  });
});
