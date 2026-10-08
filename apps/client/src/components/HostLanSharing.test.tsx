import {
  act, cleanup, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HostRuntimeStatus, NetworkInterfaceCandidate, OwnTheBlockDesktopBridge } from '../runtime/types';
import HostLanSharing from './HostLanSharing';

const qr = vi.hoisted(() => ({
  toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,phase72')),
}));

vi.mock('qrcode', () => ({ default: qr }));

const wifi: NetworkInterfaceCandidate = {
  name: 'Wi-Fi',
  displayName: 'Wi-Fi',
  address: '192.168.1.15',
  netmask: '255.255.255.0',
  preference: 'preferred',
  rank: 0,
};
const secondWifi: NetworkInterfaceCandidate = {
  name: 'Wi-Fi 2',
  displayName: 'Wi-Fi',
  address: '192.168.2.15',
  netmask: '255.255.255.0',
  preference: 'preferred',
  rank: 0,
};
const ethernet: NetworkInterfaceCandidate = {
  name: 'Ethernet',
  displayName: 'Ethernet',
  address: '10.0.0.8',
  netmask: '255.255.255.0',
  preference: 'preferred',
  rank: 1,
};
const vpn: NetworkInterfaceCandidate = {
  name: 'VPN',
  displayName: 'VPN',
  address: '100.64.0.4',
  netmask: '255.192.0.0',
  preference: 'fallback',
  rank: 3,
};

function hostStatus(
  interfaces: NetworkInterfaceCandidate[] = [wifi, vpn],
  address = interfaces[0]?.address,
): HostRuntimeStatus {
  return {
    state: 'HOSTING',
    platform: 'win32',
    appVersion: '3.0.0',
    gamePort: 53_120,
    localEndpoint: 'http://127.0.0.1:53120',
    lanAvailable: true,
    interfaces,
    advertisedEndpoints: interfaces.map(candidate => `http://${candidate.address}:53120`),
    selectedLanUrl: address ? `http://${address}:53120` : null,
  };
}

const QR_ALT = 'Mã QR tham gia phòng OTB-ABC234';

afterEach(() => {
  cleanup();
  delete window.ownTheBlockDesktop;
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  qr.toDataURL.mockClear();
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

describe('HostLanSharing', () => {
  it('shows the QR code and a copy button, copies the exact link, and never shows the link itself', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    installBridge(hostStatus());

    const { container } = render(<HostLanSharing roomCode="OTB-ABC234" />);
    const link = 'http://192.168.1.15:53120/?room=OTB-ABC234';
    const image = await screen.findByAltText(QR_ALT);
    await waitFor(() => expect(image.getAttribute('data-qr-payload')).toBe(link));

    // The owner's rule: players do not read an address, so the card does not print one.
    expect(screen.queryByText(link)).toBeNull();
    expect(container.querySelector('code')).toBeNull();
    expect(container.textContent).not.toMatch(/https?:\/\/|192\.168|53120|IPv4/u);

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép liên kết' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
    expect(screen.getByText('Đã sao chép.')).toBeTruthy();
  });

  it('renders nothing outside the desktop host', () => {
    const { container } = render(<HostLanSharing roomCode="OTB-ABC234" />);
    expect(container.firstChild).toBeNull();

    window.ownTheBlockDesktop = {} as unknown as OwnTheBlockDesktopBridge;
    const withoutHost = render(<HostLanSharing roomCode="OTB-ABC234" />);
    expect(withoutHost.container.firstChild).toBeNull();
  });

  it('puts the QR code on a captioned paper card', async () => {
    installBridge(hostStatus());
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    const image = await screen.findByAltText(QR_ALT);
    expect(image.closest('figure')?.textContent).toContain('Quét mã để vào phòng');
    expect(screen.getByText('Mời bạn bè · LAN')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Mời bạn bè · LAN' })).toBeTruthy();
  });

  it('activates an existing Online room before sharing its public link', async () => {
    const pending = { ...hostStatus(), connectionMode: 'ONLINE' as const,
      onlineEndpoint: 'https://room.trycloudflare.com', onlineState: 'AWAITING_ROOM' as const };
    const ready = { ...pending, onlineState: 'READY' as const };
    installBridge(pending);
    const activateOnline = vi.fn(() => Promise.resolve({ ok: true as const, status: ready }));
    window.ownTheBlockDesktop!.host!.activateOnline = activateOnline;
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await waitFor(() => expect(activateOnline).toHaveBeenCalledWith('OTB-ABC234'));
    const image = await screen.findByAltText(QR_ALT);
    const link = 'https://room.trycloudflare.com/?room=OTB-ABC234';
    await waitFor(() => expect(image.getAttribute('data-qr-payload')).toBe(link));
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép liên kết' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
  });

  it('says that only the link and QR reach the room when this build has no room registry', async () => {
    const ready = { ...hostStatus(), connectionMode: 'ONLINE' as const, onlineEndpoint: 'https://room.trycloudflare.com',
      onlineState: 'READY' as const, discoveryConfigured: false };
    installBridge(ready);
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    expect(await screen.findByText('Người ở mạng khác vào phòng bằng link hoặc QR này.')).toBeTruthy();
    cleanup();
    installBridge({ ...ready, discoveryConfigured: true });
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await screen.findByAltText(QR_ALT);
    expect(screen.queryByText('Người ở mạng khác vào phòng bằng link hoặc QR này.')).toBeNull();
  });

  it('registers a replacement tunnel endpoint and updates the invitation', async () => {
    const first = { ...hostStatus(), connectionMode: 'ONLINE' as const,
      onlineEndpoint: 'https://first.trycloudflare.com', onlineState: 'AWAITING_ROOM' as const };
    const second = { ...first, onlineEndpoint: 'https://second.trycloudflare.com' };
    installBridge(first);
    let notify: ((status: HostRuntimeStatus) => void) | undefined;
    window.ownTheBlockDesktop!.host!.onStatusChanged = listener => {
      notify = listener;
      return () => undefined;
    };
    let activations = 0;
    const activateOnline = vi.fn(() => {
      activations += 1;
      return Promise.resolve({
        ok: true as const,
        status: { ...(activations > 1 ? second : first), onlineState: 'READY' as const },
      });
    });
    window.ownTheBlockDesktop!.host!.activateOnline = activateOnline;
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await waitFor(() => expect(activateOnline).toHaveBeenCalledTimes(1));
    act(() => notify?.(second));
    await waitFor(() => expect(activateOnline).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByAltText(QR_ALT).getAttribute('data-qr-payload'))
      .toBe('https://second.trycloudflare.com/?room=OTB-ABC234'));
  });

  it('says in plain words that there is no network, with no QR code and no copy action', async () => {
    installBridge({ ...hostStatus([]), lanAvailable: false, selectedLanUrl: null, advertisedEndpoints: [] });
    render(<HostLanSharing roomCode="OTB-ABC234" />);

    const warning = await screen.findByText('Máy này chưa kết nối mạng. Hãy bật Wi-Fi hoặc cắm dây mạng.');
    expect(warning.getAttribute('role')).toBe('status');
    expect(screen.queryByText(/IPv4/u)).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Sao chép liên kết' }).disabled).toBe(true);
    expect(screen.queryByAltText(/Mã QR/u)).toBeNull();
    expect(qr.toDataURL).not.toHaveBeenCalled();
  });

  it('says so when the link cannot be copied automatically, without pointing at a link that is not shown', async () => {
    installBridge(hostStatus());
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await screen.findByAltText(QR_ALT);

    fireEvent.click(screen.getByRole('button', { name: 'Sao chép liên kết' }));

    expect(await screen.findByText('Không sao chép được. Hãy cho bạn bè quét mã QR.')).toBeTruthy();
  });
});

describe('HostLanSharing network choice', () => {
  it.each([
    ['one network', [wifi]],
    ['a real network and a VPN', [wifi, vpn]],
    ['Wi-Fi and Ethernet, which rank differently', [wifi, ethernet, vpn]],
  ])('is not offered with %s', async (_name, interfaces) => {
    installBridge(hostStatus(interfaces));
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await screen.findByAltText(QR_ALT);

    expect(screen.queryByLabelText('Mạng chia sẻ')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Làm mới mạng' })).toBeNull();
  });

  it('is offered when two networks rank equally well, lists only those two, and switches the invitation', async () => {
    const refreshNetwork = installBridge(
      hostStatus([wifi, secondWifi, vpn]),
      options => Promise.resolve(hostStatus([wifi, secondWifi, vpn], options?.preferredAddress)),
    );
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    const image = await screen.findByAltText(QR_ALT);
    await waitFor(() => expect(image.getAttribute('data-qr-payload')).toBe('http://192.168.1.15:53120/?room=OTB-ABC234'));

    const select = screen.getByLabelText<HTMLSelectElement>('Mạng chia sẻ');
    expect([...select.options].map(option => option.value)).toEqual(['192.168.1.15', '192.168.2.15']);
    expect(select.value).toBe('192.168.1.15');

    fireEvent.change(select, { target: { value: '192.168.2.15' } });

    await waitFor(() => expect(refreshNetwork).toHaveBeenCalledWith({ preferredAddress: '192.168.2.15' }));
    await waitFor(() => expect(screen.getByAltText(QR_ALT).getAttribute('data-qr-payload'))
      .toBe('http://192.168.2.15:53120/?room=OTB-ABC234'));
  });

  it('keeps the network in use in the list when it ranks below the tied ones', async () => {
    installBridge(hostStatus([wifi, secondWifi, ethernet], '10.0.0.8'));
    render(<HostLanSharing roomCode="OTB-ABC234" />);

    const select = await screen.findByLabelText<HTMLSelectElement>('Mạng chia sẻ');

    expect([...select.options].map(option => option.value)).toEqual(['192.168.1.15', '192.168.2.15', '10.0.0.8']);
    expect(select.value).toBe('10.0.0.8');
  });

  it('refreshes the network on request and shows the work in progress', async () => {
    let finish: (status: HostRuntimeStatus) => void = () => undefined;
    const refreshNetwork = installBridge(
      hostStatus([wifi, secondWifi]),
      () => new Promise<HostRuntimeStatus>(resolve => { finish = resolve; }),
    );
    render(<HostLanSharing roomCode="OTB-ABC234" />);
    await screen.findByAltText(QR_ALT);

    fireEvent.click(screen.getByRole('button', { name: 'Làm mới mạng' }));
    expect(refreshNetwork).toHaveBeenCalledWith(undefined);
    const busy = await screen.findByRole<HTMLButtonElement>('button', { name: 'Đang làm mới…' });
    expect(busy.disabled).toBe(true);

    finish(hostStatus([wifi, secondWifi], '192.168.2.15'));
    await waitFor(() => expect(screen.getByAltText(QR_ALT).getAttribute('data-qr-payload'))
      .toBe('http://192.168.2.15:53120/?room=OTB-ABC234'));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Làm mới mạng' }).disabled).toBe(false);
  });
});
