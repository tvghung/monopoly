import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesktopWindowState, OwnTheBlockDesktopBridge } from '../runtime/types';
import { DEFAULT_GAME_SETTINGS } from './defaults';
import { useSettings } from './selectors';
import { SettingsProvider } from './SettingsProvider';

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
});

function SettingsProbe() {
  const { settings, resetSettings } = useSettings();
  return (
    <>
      <output data-testid="fullscreen">{String(settings.fullscreen)}</output>
      <button type="button" onClick={resetSettings}>reset</button>
    </>
  );
}

function makeBridge(fullscreen: boolean) {
  let listener: ((state: DesktopWindowState) => void) | undefined;
  const getState = vi.fn(() => Promise.resolve<DesktopWindowState>({
    fullscreen,
    maximized: false,
    resizable: true,
  }));
  const setFullscreen = vi.fn(() => Promise.resolve());
  const toggleFullscreen = vi.fn(() => Promise.resolve());
  const onFullscreenChanged = vi.fn((nextListener: (state: DesktopWindowState) => void) => {
    listener = nextListener;
    return () => { listener = undefined; };
  });
  const bridge: OwnTheBlockDesktopBridge = {
    getRuntimeConfig: vi.fn(),
    window: {
      getState,
      setFullscreen,
      toggleFullscreen,
      onFullscreenChanged,
    },
    quit: {
      onQuitRequested: vi.fn(() => () => {}),
      respond: vi.fn(),
    },
    openExternal: vi.fn(async () => {}),
  };
  return {
    bridge,
    getState,
    setFullscreen,
    emit: (nextFullscreen: boolean) => listener?.({ fullscreen: nextFullscreen, maximized: false, resizable: true }),
  };
}

describe('SettingsProvider desktop fullscreen synchronization', () => {
  it('applies persisted fullscreen intent without letting native startup state erase it', async () => {
    const { bridge, getState, setFullscreen, emit } = makeBridge(false);
    window.ownTheBlockDesktop = bridge;
    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, fullscreen: true }}>
        <SettingsProbe />
      </SettingsProvider>,
    );

    await waitFor(() => expect(setFullscreen).toHaveBeenCalledWith(true));
    expect(getState).not.toHaveBeenCalled();
    expect(screen.getByTestId('fullscreen').textContent).toBe('true');
    emit(false);
    await waitFor(() => expect(screen.getByTestId('fullscreen').textContent).toBe('false'));
    emit(true);
    await waitFor(() => expect(screen.getByTestId('fullscreen').textContent).toBe('true'));
  });

  it('applies a persisted windowed intent once at startup', async () => {
    const { bridge, setFullscreen } = makeBridge(false);
    window.ownTheBlockDesktop = bridge;
    render(
      <StrictMode>
        <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, fullscreen: false }}>
          <SettingsProbe />
        </SettingsProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(setFullscreen).toHaveBeenCalledWith(false));
    expect(setFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByTestId('fullscreen').textContent).toBe('false');
  });

  it('resets the native BrowserWindow fullscreen state with the settings reset', async () => {
    const { bridge, setFullscreen } = makeBridge(false);
    window.ownTheBlockDesktop = bridge;
    render(
      <SettingsProvider initialSettings={{ ...DEFAULT_GAME_SETTINGS, fullscreen: true }}>
        <SettingsProbe />
      </SettingsProvider>,
    );

    await waitFor(() => expect(setFullscreen).toHaveBeenCalledWith(true));
    setFullscreen.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    await waitFor(() => expect(setFullscreen).toHaveBeenCalledWith(false));
    expect(setFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByTestId('fullscreen').textContent).toBe('false');
  });
});
