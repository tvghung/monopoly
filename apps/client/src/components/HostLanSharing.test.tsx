import {
  cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HostRuntimeStatus, OwnTheBlockDesktopBridge } from '../runtime/types';
import HostLanSharing from './HostLanSharing';

const qr = vi.hoisted(() => ({
  toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,phase72')),
}));

vi.mock('qrcode', () => ({ default: qr }));

const interfaces = [
  {
    name: 'Wi-Fi',
    displayName: 'Wi-Fi',
    address: '192.168.1.15',
    netmask: '255.255.255.0',
    preference: 'preferred' as const,
    rank: 0,
  },
  {
    name: 'VPN',
    displayName: 'VPN',
    address: '100.64.0.4',
    netmask: '255.192.0.0',
    preference: 'fallback' as const,
    rank: 3,
  },
];

function hostStatus(address = interfaces[0].address): HostRuntimeStatus {
  return {
    state: 'HOSTING',
    platform: 'win32',
    appVersion: '3.0.0',
    gamePort: 53_120,
    localEndpoint: 'http://127.0.0.1:53120',
    lanAvailable: true,
    interfaces,
    advertisedEndpoints: interfaces.map(candidate => `http://${candidate.address}:53120`),
    selectedLanUrl: `http://${address}:53120`,
  };
}

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  qr.toDataURL.mockClear();
});

describe('HostLanSharing', () => {
  it('renders the exact URL and QR, copies it, and refreshes the selected interface', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const refreshNetwork = vi.fn((options?: { preferredAddress?: string }) => (
      Promise.resolve(hostStatus(options?.preferredAddress))
    ));
    window.ownTheBlockDesktop = {
      host: {
        getStatus: vi.fn(() => Promise.resolve(hostStatus())),
        refreshNetwork,
        onStatusChanged: vi.fn(() => () => undefined),
      },
    } as unknown as OwnTheBlockDesktopBridge;

    render(<HostLanSharing roomCode="OTB-ABC234" />);
    const firstUrl = 'http://192.168.1.15:53120/?room=OTB-ABC234';
    await waitFor(() => expect(screen.getByText(firstUrl)).toBeTruthy());
    await waitFor(() => expect(screen.getByAltText('Mã QR tham gia phòng OTB-ABC234')
      .getAttribute('data-qr-payload')).toBe(firstUrl));

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép liên kết' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(firstUrl));
    expect(screen.getByText('Đã sao chép.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Mạng chia sẻ'), {
      target: { value: '100.64.0.4' },
    });
    await waitFor(() => expect(refreshNetwork).toHaveBeenCalledWith({
      preferredAddress: '100.64.0.4',
    }));
    expect(await screen.findByText('http://100.64.0.4:53120/?room=OTB-ABC234')).toBeTruthy();
  });

  function installBridge(
    status: HostRuntimeStatus,
    refreshNetwork: (options?: { preferredAddress?: string }) => Promise<HostRuntimeStatus> = () => Promise.resolve(status),
  ) {
    const refresh = vi.fn(refreshNetwork);
    window.ownTheBlockDesktop = {
      host: {
        getStatus: vi.fn(() => Promise.resolve(status)),
        refreshNetwork: refresh,
        onStatusChanged: vi.fn(() => () => undefined),
      },
    } as unknown as OwnTheBlockDesktopBridge;
    return refresh;
  }

  it('renders nothing outside the desktop host', () => {
    const { container } = render(<HostLanSharing roomCode="OTB-ABC234" />);
    expect(container.firstChild).toBeNull();

    window.ownTheBlockDesktop = {} as unknown as OwnTheBlockDesktopBridge;
    const withoutHost = render(<HostLanSharing roomCode="OTB-ABC234" />);
    expect(withoutHost.container.firstChild).toBeNull();
  });

  it('puts the QR code on a captioned paper card next to the link', async () => {
    installBridge(hostStatus());
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    const qr = await screen.findByAltText('Mã QR tham gia phòng OTB-ABC234');
    expect(qr.closest('figure')?.textContent).toContain('Quét mã để vào phòng');
    expect(screen.getByText('Mời qua mạng LAN')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Mời qua mạng LAN' })).toBeTruthy();
  });

  it('shows a plain warning, no QR code and no copy action when there is no usable LAN address', async () => {
    installBridge({ ...hostStatus(), lanAvailable: false, selectedLanUrl: null, interfaces: [], advertisedEndpoints: [] });
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    expect((await screen.findByText('Chưa có địa chỉ IPv4 LAN dùng được.')).getAttribute('role')).toBe('status');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sao chép liên kết' }).disabled).toBe(true);
    expect(screen.queryByAltText(/Mã QR/u)).toBeNull();
    expect(qr.toDataURL).not.toHaveBeenCalled();
  });

  it('only offers the network choice when there is more than one network', async () => {
    installBridge({ ...hostStatus(), interfaces: [interfaces[0]] });
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await screen.findByText('http://192.168.1.15:53120/?room=OTB-ABC234');
    expect(screen.queryByLabelText('Mạng chia sẻ')).toBeNull();
  });

  it('says so when the link cannot be copied automatically', async () => {
    installBridge(hostStatus());
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await screen.findByText('http://192.168.1.15:53120/?room=OTB-ABC234');
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép liên kết' }));
    expect(await screen.findByText('Không thể sao chép tự động; hãy chọn liên kết ở trên.')).toBeTruthy();
  });

  it('refreshes the network on request and shows the work in progress', async () => {
    let finish: (status: HostRuntimeStatus) => void = () => undefined;
    const refreshNetwork = installBridge(hostStatus(), () => new Promise<HostRuntimeStatus>(resolve => { finish = resolve; }));
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await screen.findByText('http://192.168.1.15:53120/?room=OTB-ABC234');

    fireEvent.click(screen.getByRole('button', { name: 'Làm mới mạng' }));
    expect(refreshNetwork).toHaveBeenCalledWith(undefined);
    const busy = await screen.findByRole<HTMLButtonElement>('button', { name: 'Đang làm mới…' });
    expect(busy.disabled).toBe(true);

    finish(hostStatus('100.64.0.4'));
    expect(await screen.findByText('http://100.64.0.4:53120/?room=OTB-ABC234')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Làm mới mạng' }).disabled).toBe(false);
  });
});
