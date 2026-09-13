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
});
