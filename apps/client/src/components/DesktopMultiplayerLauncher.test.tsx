import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DesktopMultiplayerLauncher from './DesktopMultiplayerLauncher';
import type {
  DesktopLaunchSelection,
  HostRuntimeStatus,
  OwnTheBlockDesktopBridge,
} from '../runtime/types';

const status: HostRuntimeStatus = {
  state: 'IDLE',
  platform: 'win32',
  appVersion: '3.0.0',
  gamePort: null,
  localEndpoint: null,
  lanAvailable: false,
  interfaces: [{
    name: 'Wi-Fi',
    displayName: 'Wi-Fi',
    address: '192.168.1.15',
    netmask: '255.255.255.0',
    preference: 'preferred',
    rank: 0,
  }],
  advertisedEndpoints: [],
  selectedLanUrl: null,
};

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
});

describe('DesktopMultiplayerLauncher', () => {
  it('keeps the configured endpoint visible and scopes the launch to its room', () => {
    const onReady = vi.fn();
    window.ownTheBlockDesktop = {} as OwnTheBlockDesktopBridge;

    render(
      <DesktopMultiplayerLauncher
        configuredRuntimeConfig={{
          target: 'desktop',
          socketUrl: 'http://192.168.1.15:8080',
          platform: 'darwin',
          appVersion: '3.0.0',
        }}
        onReady={onReady}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Máy chủ đã cấu hình/u }));
    expect(screen.getByText('http://192.168.1.15:8080')).toBeTruthy();
    expect(screen.getByLabelText('Mã phòng')).toBeTruthy();
    expect(screen.queryByLabelText('Địa chỉ máy chủ LAN')).toBeNull();
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'lan-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kết nối và vào phòng' }));

    expect(onReady).toHaveBeenCalledWith({
      runtimeConfig: {
        target: 'desktop',
        socketUrl: 'http://192.168.1.15:8080',
        platform: 'darwin',
        appVersion: '3.0.0',
      },
      initialJoin: { name: 'Ada', roomCode: 'LAN-1234' },
      targetRoomCode: 'LAN-1234',
      hosting: false,
    });
  });

  it('uses one room code for hosted admission and reconnect lookup', async () => {
    const onReady = vi.fn();
    const hostStatus: HostRuntimeStatus = {
      ...status,
      state: 'HOSTING',
      gamePort: 8080,
      localEndpoint: 'http://127.0.0.1:8080',
      lanAvailable: true,
      advertisedEndpoints: ['http://192.168.1.15:8080'],
      selectedLanUrl: 'http://192.168.1.15:8080',
    };
    window.ownTheBlockDesktop = {
      host: {
        getStatus: vi.fn(() => Promise.resolve(status)),
        start: vi.fn(() => Promise.resolve({ ok: true as const, status: hostStatus })),
        stop: vi.fn(() => Promise.resolve({ ok: true as const, status })),
        refreshNetwork: vi.fn(() => Promise.resolve(status)),
        onStatusChanged: vi.fn(() => () => undefined),
      },
    } as unknown as OwnTheBlockDesktopBridge;

    render(<DesktopMultiplayerLauncher onReady={onReady} />);
    fireEvent.click(screen.getByRole('button', { name: /Host Game/u }));
    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    const submit = screen.getByRole('button', { name: 'Tạo và vào phòng' });
    await waitFor(() => expect(submit.getAttribute('disabled')).toBeNull());
    fireEvent.click(submit);

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    const selection = onReady.mock.calls[0]?.[0] as DesktopLaunchSelection;
    expect(selection.initialJoin?.roomCode).toBe(selection.targetRoomCode);
    expect(selection.hosting).toBe(true);
  });
});
