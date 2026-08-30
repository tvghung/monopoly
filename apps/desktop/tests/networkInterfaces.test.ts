import { describe, expect, it } from 'vitest';

import {
  advertisedEndpoints,
  isPrivateIPv4,
  resolveNetworkInterfaces,
} from '../src/networkInterfaces';

describe('LAN network interface resolver', () => {
  it('accepts only private IPv4 ranges', () => {
    expect(isPrivateIPv4('10.0.0.4')).toBe(true);
    expect(isPrivateIPv4('172.16.0.4')).toBe(true);
    expect(isPrivateIPv4('172.31.255.4')).toBe(true);
    expect(isPrivateIPv4('192.168.1.4')).toBe(true);
    expect(isPrivateIPv4('172.15.0.4')).toBe(false);
    expect(isPrivateIPv4('172.32.0.4')).toBe(false);
    expect(isPrivateIPv4('169.254.1.4')).toBe(false);
    expect(isPrivateIPv4('127.0.0.1')).toBe(false);
    expect(isPrivateIPv4('::1')).toBe(false);
  });

  it('ranks Wi-Fi and Ethernet ahead of virtual adapters deterministically', () => {
    const provider = () => ({
      'vEthernet (Default Switch)': [{ address: '172.20.0.1', netmask: '255.255.0.0', family: 'IPv4', mac: '', internal: false }],
      Ethernet: [{ address: '192.168.0.25', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false }],
      WiFi: [{ address: '192.168.1.15', netmask: '255.255.255.0', family: 'IPv4', mac: '', internal: false }],
      loopback: [{ address: '127.0.0.1', netmask: '255.0.0.0', family: 'IPv4', mac: '', internal: true }],
    });

    const candidates = resolveNetworkInterfaces(provider);
    expect(candidates.map(candidate => candidate.address)).toEqual([
      '192.168.1.15',
      '192.168.0.25',
      '172.20.0.1',
    ]);
    expect(candidates[0]).toMatchObject({ displayName: 'Wi-Fi', preference: 'preferred' });
    expect(candidates[2]).toMatchObject({ preference: 'fallback', broadcast: '172.20.255.255' });
    expect(advertisedEndpoints(candidates, 8080)).toEqual([
      'http://192.168.1.15:8080',
      'http://192.168.0.25:8080',
      'http://172.20.0.1:8080',
    ]);
  });
});
