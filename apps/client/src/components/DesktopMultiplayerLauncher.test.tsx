import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
    fireEvent.click(screen.getByRole('button', { name: /Tạo phòng trên máy này/u }));
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

const hostingStatus: HostRuntimeStatus = {
  ...status,
  state: 'HOSTING',
  gamePort: 8080,
  localEndpoint: 'http://127.0.0.1:8080',
  lanAvailable: true,
  advertisedEndpoints: ['http://192.168.1.15:8080'],
  selectedLanUrl: 'http://192.168.1.15:8080',
};

function installHostBridge(current: HostRuntimeStatus) {
  const host = {
    getStatus: vi.fn(() => Promise.resolve(current)),
    start: vi.fn(),
    stop: vi.fn(() => Promise.resolve({ ok: true as const, status })),
    refreshNetwork: vi.fn(() => Promise.resolve(current)),
    onStatusChanged: vi.fn(() => () => undefined),
  };
  window.ownTheBlockDesktop = { host } as unknown as OwnTheBlockDesktopBridge;
  return host;
}

// A variable path keeps Vite from rewriting the URL into an asset reference.
const entrySharedCssPath = './style/EntryShared.css';
const entrySharedCss = readFileSync(fileURLToPath(new URL(entrySharedCssPath, import.meta.url)), 'utf8');

const configuredRuntimeConfig = {
  target: 'desktop' as const,
  socketUrl: 'http://192.168.1.15:8080',
  platform: 'win32' as const,
  appVersion: '3.0.0',
};

describe('DesktopMultiplayerLauncher choices', () => {
  it('names the ways to play in Vietnamese and keeps the English labels out', () => {
    installHostBridge(status);

    const { container } = render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Chơi qua mạng LAN' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tạo phòng trên máy này/u })).toBeTruthy();
    expect(screen.getByText('Máy này làm chủ phòng, người khác vào qua Wi-Fi')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Tham gia phòng LAN/u })).toBeTruthy();
    expect(screen.queryByText(/Host Game|Join Game/u)).toBeNull();
    // The glyphs are decoration: the card text names the choice.
    const glyphs = container.querySelectorAll('.desktop-launcher__choice svg');
    expect(glyphs).toHaveLength(2);
    for (const glyph of glyphs) expect(glyph.getAttribute('aria-hidden')).toBe('true');
  });

  it('offers the configured server as a third choice only when one is configured', () => {
    installHostBridge(status);
    const { unmount } = render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Máy chủ đã cấu hình/u })).toBeNull();
    unmount();

    render(<DesktopMultiplayerLauncher configuredRuntimeConfig={configuredRuntimeConfig} onReady={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Máy chủ đã cấu hình/u })).toBeTruthy();
  });

  it('continues or stops a host that is already running', async () => {
    const onReady = vi.fn();
    const host = installHostBridge(hostingStatus);
    render(<DesktopMultiplayerLauncher onReady={onReady} />);

    fireEvent.click(await screen.findByRole('button', { name: /Tiếp tục Host đang chạy/u }));
    expect(onReady).toHaveBeenCalledWith({
      runtimeConfig: {
        target: 'desktop', socketUrl: 'http://127.0.0.1:8080', platform: 'win32', appVersion: '3.0.0',
      },
      hosting: true,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dừng Host' }));
    await waitFor(() => expect(host.stop).toHaveBeenCalledOnce());
  });

  it('shows a configuration error from the bootstrap as an alert', () => {
    installHostBridge(status);

    render(<DesktopMultiplayerLauncher configurationError="Không thể đọc cấu hình." onReady={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toBe('Không thể đọc cấu hình.');
  });
});

describe('DesktopMultiplayerLauncher forms', () => {
  it('keeps the host form ids and labels, explains the disabled button, and focuses the network select visibly', async () => {
    installHostBridge(status);
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Tạo phòng trên máy này/u }));

    expect(screen.getByRole('heading', { level: 2, name: 'Tạo phòng trên máy này' })).toBeTruthy();
    const network = await screen.findByLabelText<HTMLSelectElement>('Mạng dùng để chia sẻ');
    expect(network.id).toBe('desktop-lan-interface');
    expect(network.classList.contains('entry-control')).toBe(true);
    expect(entrySharedCss).toContain('.entry-control:focus-visible');
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Tạo và vào phòng' });
    expect(submit.disabled).toBe(true);
    const reason = screen.getByText('Nhập tên của bạn để tiếp tục.');
    expect(submit.getAttribute('aria-describedby')).toBe(reason.id);

    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    expect(submit.disabled).toBe(false);
    expect(screen.queryByText('Nhập tên của bạn để tiếp tục.')).toBeNull();
  });

  it('keeps the join form ids, labels and validation copy, and goes back to the choices', () => {
    installHostBridge(status);
    const onReady = vi.fn();
    render(<DesktopMultiplayerLauncher onReady={onReady} />);

    fireEvent.click(screen.getByRole('button', { name: /Tham gia phòng LAN/u }));

    expect(screen.getByRole('heading', { level: 2, name: 'Tham gia phòng LAN' })).toBeTruthy();
    expect(screen.getByLabelText('Địa chỉ Host').id).toBe('desktop-lan-address');
    expect(screen.getByLabelText('Mã phòng').id).toBe('desktop-lan-room');
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Kết nối và vào phòng' });
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Nhập tên của bạn để tiếp tục.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tên của bạn'), { target: { value: 'Ada' } });
    expect(screen.getByText('Nhập mã phòng do Host chia sẻ.')).toBeTruthy();
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Mã phòng'), { target: { value: 'otb-abc234' } });
    expect(submit.disabled).toBe(false);
    expect(screen.queryByText('Nhập mã phòng do Host chia sẻ.')).toBeNull();
    fireEvent.click(submit);
    expect(screen.getByRole('alert').textContent).toBe('Nhập IPv4 và cổng, ví dụ 192.168.1.25:53120.');
    expect(onReady).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Chọn lại chế độ' }));
    expect(screen.getByRole('button', { name: /Tạo phòng trên máy này/u })).toBeTruthy();
    expect(screen.queryByLabelText('Địa chỉ Host')).toBeNull();
  });

  it('returns the focus to the card that opened the form when the player goes back', () => {
    installHostBridge(status);
    render(<DesktopMultiplayerLauncher onReady={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Tham gia phòng LAN/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Chọn lại chế độ' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Tham gia phòng LAN/u }));

    fireEvent.click(screen.getByRole('button', { name: /Tạo phòng trên máy này/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Chọn lại chế độ' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Tạo phòng trên máy này/u }));
  });

  it('keeps the field border above 3:1 on the paper card and the hero greeting finite', () => {
    const mix = /--entry-field-border:\s*color-mix\(in srgb, var\(--color-text-primary\) (\d+)%/.exec(entrySharedCss);
    expect(Number(mix?.[1])).toBeGreaterThanOrEqual(52);

    const heroCssPath = './style/JoinHero.css';
    const heroCss = readFileSync(fileURLToPath(new URL(heroCssPath, import.meta.url)), 'utf8');
    expect(heroCss).not.toMatch(/\binfinite\b/);
    expect(heroCss).not.toMatch(/rgb\(\s*43 29 20/);
  });

  it('can open a form directly for the design lab', () => {
    installHostBridge(status);

    render(<DesktopMultiplayerLauncher initialMode="join" onReady={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Tham gia phòng LAN' })).toBeTruthy();
  });
});
