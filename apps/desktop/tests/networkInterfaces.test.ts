import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  advertisedEndpoints,
  broadcastAddress,
  isInSameSubnet,
  isPrivateIPv4,
  isUsableLanIPv4,
  probeDefaultRouteAddress,
  resolveNetworkInterfaces,
} from '../src/networkInterfaces';

function ipv4(address: string, netmask = '255.255.255.0') {
  return { address, netmask, family: 'IPv4', mac: '', internal: false };
}

describe('LAN network interface resolver', () => {
  it('rejects clearly unusable V1 addresses without excluding plausible adapters', () => {
    expect(isUsableLanIPv4('10.0.0.4')).toBe(true);
    expect(isUsableLanIPv4('172.16.0.4')).toBe(true);
    expect(isUsableLanIPv4('192.168.1.4')).toBe(true);
    expect(isUsableLanIPv4('100.64.0.4')).toBe(true);
    expect(isUsableLanIPv4('203.0.113.4')).toBe(true);
    expect(isUsableLanIPv4('0.0.0.0')).toBe(false);
    expect(isUsableLanIPv4('169.254.1.4')).toBe(false);
    expect(isUsableLanIPv4('127.0.0.1')).toBe(false);
    expect(isUsableLanIPv4('::1')).toBe(false);
  });

  it('ranks Wi-Fi and Ethernet ahead of virtual adapters deterministically', () => {
    const provider = () => ({
      'vEthernet (Default Switch)': [ipv4('172.20.0.1', '255.255.0.0')],
      Ethernet: [ipv4('192.168.0.25')],
      WiFi: [ipv4('192.168.1.15')],
      loopback: [{ ...ipv4('127.0.0.1', '255.0.0.0'), internal: true }],
    });

    const candidates = resolveNetworkInterfaces(provider);
    expect(candidates.map(candidate => candidate.address)).toEqual([
      '192.168.1.15',
      '192.168.0.25',
      '172.20.0.1',
    ]);
    expect(candidates[0]).toMatchObject({ displayName: 'Wi-Fi', preference: 'preferred' });
    expect(candidates[2]).toMatchObject({ preference: 'fallback' });
    expect(advertisedEndpoints(candidates, 8080)).toEqual([
      'http://192.168.1.15:8080',
      'http://192.168.0.25:8080',
      'http://172.20.0.1:8080',
    ]);
    expect(() => advertisedEndpoints(candidates, 0)).toThrow('between 1 and 65535');
  });

  it('reflects interfaces appearing and disappearing without retaining stale values', () => {
    let current = {
      WiFi: [ipv4('192.168.1.15')],
    };
    const provider = () => current;
    expect(resolveNetworkInterfaces(provider)).toHaveLength(1);
    current = { WiFi: [] };
    expect(resolveNetworkInterfaces(provider)).toEqual([]);
  });

  it('drops /32 addresses, which have no neighbours to play with', () => {
    const candidates = resolveNetworkInterfaces(() => ({
      Wi_Fi: [ipv4('10.8.0.2', '255.255.255.255')],
      Ethernet: [ipv4('192.168.0.25')],
    }));

    expect(candidates.map(candidate => candidate.address)).toEqual(['192.168.0.25']);
  });

  it.each([
    'vmnet8', 'vboxnet0', 'virbr0', 'veth1a2b', 'docker0', 'wsl0', 'tailscale0', 'ZeroTier One [8056c2e21c000001]',
    'Hamachi', 'WireGuard Tunnel', 'wg0', 'CloudflareWARP', 'utun3', 'ppp0', 'Npcap Loopback Adapter',
    'Bluetooth Network Connection', 'vnic1', 'bridge100', 'Hyper-V Virtual Ethernet Adapter',
  ])('puts the %s adapter last, behind a real one', name => {
    const candidates = resolveNetworkInterfaces(() => ({
      [name]: [ipv4('192.168.50.2')],
      Ethernet: [ipv4('192.168.60.2')],
    }));

    expect(candidates.map(candidate => candidate.address)).toEqual(['192.168.60.2', '192.168.50.2']);
    expect(candidates[1]).toMatchObject({ rank: 3, preference: 'fallback' });
  });

  it('treats the 100.64.0.0/10 space as an overlay network whatever the adapter is called', () => {
    const candidates = resolveNetworkInterfaces(() => ({
      'Wi-Fi': [ipv4('100.100.1.2', '255.192.0.0')],
      'Ethernet 2': [ipv4('192.168.0.25')],
    }));

    expect(candidates.map(candidate => candidate.address)).toEqual(['192.168.0.25', '100.100.1.2']);
    expect(candidates[1].rank).toBe(3);
    expect(isPrivateIPv4('100.100.1.2')).toBe(false);
  });

  it('boosts the interface that carries the default route, but only a real Wi-Fi or Ethernet adapter', () => {
    const provider = () => ({
      'Wi-Fi': [ipv4('192.168.1.15')],
      Ethernet: [ipv4('10.0.0.8')],
      'Tailscale': [ipv4('192.168.77.2')],
    });

    expect(resolveNetworkInterfaces(provider).map(candidate => candidate.address))
      .toEqual(['192.168.1.15', '10.0.0.8', '192.168.77.2']);
    expect(resolveNetworkInterfaces(provider, '10.0.0.8').map(candidate => candidate.address))
      .toEqual(['10.0.0.8', '192.168.1.15', '192.168.77.2']);
    // A full-tunnel VPN owns the default route, yet it must not win over the real network.
    expect(resolveNetworkInterfaces(provider, '192.168.77.2').map(candidate => candidate.address))
      .toEqual(['192.168.1.15', '10.0.0.8', '192.168.77.2']);
    // A default route that matches no listed address changes nothing.
    expect(resolveNetworkInterfaces(provider, '172.31.0.9').map(candidate => candidate.address))
      .toEqual(['192.168.1.15', '10.0.0.8', '192.168.77.2']);
  });

  it('breaks ties by private range first and then numerically, not as text', () => {
    const candidates = resolveNetworkInterfaces(() => ({
      'Ethernet 1': [ipv4('10.0.0.10')],
      'Ethernet 2': [ipv4('203.0.113.4')],
      'Ethernet 3': [ipv4('10.0.0.9')],
      'Ethernet 4': [ipv4('9.9.9.9')],
      'Ethernet 5': [ipv4('172.16.0.4')],
    }));

    // Text order would put 10.0.0.10 ahead of 10.0.0.9 and 9.9.9.9 last.
    expect(candidates.map(candidate => candidate.address))
      .toEqual(['10.0.0.9', '10.0.0.10', '172.16.0.4', '9.9.9.9', '203.0.113.4']);
  });

  it('keeps one candidate per address', () => {
    const candidates = resolveNetworkInterfaces(() => ({
      'Wi-Fi': [ipv4('192.168.1.15')],
      'Wi-Fi 2': [ipv4('192.168.1.15')],
    }));

    expect(candidates).toHaveLength(1);
  });
});

describe('IPv4 subnet helpers', () => {
  it('derives the directed broadcast address from the address and mask', () => {
    expect(broadcastAddress('192.168.1.15', '255.255.255.0')).toBe('192.168.1.255');
    expect(broadcastAddress('10.20.30.40', '255.255.0.0')).toBe('10.20.255.255');
    expect(broadcastAddress('172.16.5.9', '255.255.252.0')).toBe('172.16.7.255');
    expect(broadcastAddress('192.168.1.15', 'bad')).toBeUndefined();
  });

  it('tells whether two addresses share a subnet', () => {
    expect(isInSameSubnet('192.168.1.200', '192.168.1.15', '255.255.255.0')).toBe(true);
    expect(isInSameSubnet('192.168.2.200', '192.168.1.15', '255.255.255.0')).toBe(false);
    expect(isInSameSubnet('192.168.2.200', '192.168.1.15', '255.255.0.0')).toBe(true);
    expect(isInSameSubnet('not-an-address', '192.168.1.15', '255.255.255.0')).toBe(false);
  });
});

class FakeProbeSocket extends EventEmitter {
  closed = false;
  localAddress = '192.168.1.15';

  constructor(private readonly behavior: 'connect' | 'error' | 'silent' | 'throw' = 'connect') {
    super();
  }

  connect(_port: number, _address: string, callback?: () => void): void {
    if (this.behavior === 'throw') throw new Error('connect failed');
    if (this.behavior === 'connect') queueMicrotask(() => callback?.());
    if (this.behavior === 'error') queueMicrotask(() => this.emit('error', new Error('ENETUNREACH')));
  }

  address(): { address: string } {
    return { address: this.localAddress };
  }

  close(): void {
    this.closed = true;
  }
}

describe('default route probe', () => {
  afterEach(() => vi.useRealTimers());

  it('reads the local address the OS picked for a connected UDP socket, without sending anything', async () => {
    const socket = new FakeProbeSocket();
    const connect = vi.spyOn(socket, 'connect');

    await expect(probeDefaultRouteAddress(() => socket)).resolves.toBe('192.168.1.15');
    expect(connect).toHaveBeenCalledWith(9, '203.0.113.1', expect.any(Function));
    expect(socket.closed).toBe(true);
  });

  it('reports no default route when the connect fails, throws or never answers', async () => {
    const failed = new FakeProbeSocket('error');
    await expect(probeDefaultRouteAddress(() => failed)).resolves.toBeUndefined();
    expect(failed.closed).toBe(true);

    await expect(probeDefaultRouteAddress(() => new FakeProbeSocket('throw'))).resolves.toBeUndefined();

    vi.useFakeTimers();
    const silent = new FakeProbeSocket('silent');
    const pending = probeDefaultRouteAddress(() => silent, 500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toBeUndefined();
    expect(silent.closed).toBe(true);
  });

  it('ignores an address that is not a usable LAN address', async () => {
    const socket = new FakeProbeSocket();
    socket.localAddress = '127.0.0.1';

    await expect(probeDefaultRouteAddress(() => socket)).resolves.toBeUndefined();
  });

  it('survives a socket factory that throws', async () => {
    await expect(probeDefaultRouteAddress(() => { throw new Error('no udp'); })).resolves.toBeUndefined();
  });
});
