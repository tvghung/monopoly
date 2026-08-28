import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigLoadError } from '../../runtime/runtimeConfig';

const bootstrapMock = vi.hoisted(() => ({
  bootstrap: vi.fn(),
}));

vi.mock('./bootstrap', () => bootstrapMock);
vi.mock('../../App', () => ({ default: () => <p>ready</p> }));

import AppBootstrap from './AppBootstrap';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  bootstrapMock.bootstrap.mockReset();
});

describe('AppBootstrap failure handling', () => {
  it('logs technical bootstrap failures while rendering safe recovery copy', async () => {
    bootstrapMock.bootstrap.mockRejectedValue(new Error('secret bridge failure'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AppBootstrap />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Không thể khởi động trò chơi' })).toBeTruthy();
    });
    expect(screen.getByText('Không thể khởi động trò chơi. Hãy thử lại.')).toBeTruthy();
    expect(screen.queryByText('secret bridge failure')).toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      'Own the Block bootstrap failed.',
      expect.objectContaining({ message: 'secret bridge failure' }),
    );

    bootstrapMock.bootstrap.mockResolvedValue({
      runtimeConfig: { target: 'web' },
      socket: { disconnect: vi.fn() },
      settings: {
        version: 1,
        masterVolume: 1,
        musicVolume: 0.7,
        sfxVolume: 0.8,
        animationSpeed: 1,
        reducedMotion: false,
        fullscreen: false,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(bootstrapMock.bootstrap).toHaveBeenCalledTimes(2));
    consoleError.mockRestore();
  });

  it('shows the runtime-config safe copy for a typed local runtime failure', async () => {
    bootstrapMock.bootstrap.mockRejectedValue(
      new RuntimeConfigLoadError('PACKAGED_SOCKET_URL_MISSING'),
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<AppBootstrap />);

    await waitFor(() => {
      expect(screen.getByText('Không thể chuẩn bị kết nối trò chơi. Hãy thử lại.')).toBeTruthy();
    });
    expect(screen.queryByText('PACKAGED_SOCKET_URL_MISSING')).toBeNull();
    expect(screen.queryByText('secret main-process endpoint detail')).toBeNull();
    expect(screen.queryByText('Desktop runtime configuration could not be loaded.')).toBeNull();
  });
});
