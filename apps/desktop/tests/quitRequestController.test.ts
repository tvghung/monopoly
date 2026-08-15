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
});
