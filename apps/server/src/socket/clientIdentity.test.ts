import { describe, expect, it } from 'vitest';
import { clientKey, isLoopbackPeer, tunnelHeaderTrusted } from './clientIdentity.js';

describe('trusted client identity', () => {
  it('keys a direct peer by its own address and ignores every header it sends', () => {
    const forged = {
      'cf-connecting-ip': '203.0.113.9',
      'x-forwarded-for': '203.0.113.9',
      'true-client-ip': '203.0.113.9',
    };
    for (const trusted of [true, false]) {
      expect(clientKey('192.168.1.20', forged, trusted)).toBe('peer:192.168.1.20');
      expect(clientKey('::ffff:192.168.1.20', forged, trusted)).toBe('peer:192.168.1.20');
    }
    // Rotating the forged value cannot mint a new key for the same device.
    expect(clientKey('192.168.1.20', { 'cf-connecting-ip': '198.51.100.1' }, true))
      .toBe(clientKey('192.168.1.20', { 'cf-connecting-ip': '198.51.100.2' }, true));
  });

  it('names a tunnel visitor by Cloudflare\'s header only from the loopback connector of a trusted tunnel', () => {
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' }, true)).toBe('visitor:203.0.113.9');
    expect(clientKey('::1', { 'cf-connecting-ip': '203.0.113.9' }, true)).toBe('visitor:203.0.113.9');
    expect(clientKey('::ffff:127.0.0.1', { 'cf-connecting-ip': ' 203.0.113.9 ' }, true)).toBe('visitor:203.0.113.9');
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' }, false)).toBe('local');
  });

  it('keeps visitors who share one public address in one bucket and different addresses apart', () => {
    const a = clientKey('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' }, true);
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' }, true)).toBe(a);
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '203.0.113.10' }, true)).not.toBe(a);
  });

  it('groups IPv6 visitors by network prefix so a household cannot mint unlimited keys', () => {
    const first = clientKey('127.0.0.1', { 'cf-connecting-ip': '2001:db8:1:2::1' }, true);
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '2001:db8:1:2:ffff:ffff:ffff:ffff' }, true)).toBe(first);
    // Every /64 of one /56 shares a key; the next /56 does not.
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '2001:db8:1:ff::1' }, true)).toBe(first);
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '2001:db8:1:100::1' }, true)).not.toBe(first);
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '2001:db8:2:2::1' }, true)).not.toBe(first);
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '::ffff:203.0.113.9' }, true)).toBe('visitor:203.0.113.9');
  });

  it('shares one local key for loopback traffic without a usable visitor address', () => {
    for (const headers of [
      {},
      { 'cf-connecting-ip': '' },
      { 'cf-connecting-ip': 'not-an-address' },
      { 'cf-connecting-ip': '203.0.113.9, 198.51.100.1' },
      { 'cf-connecting-ip': ['203.0.113.9', '198.51.100.1'] },
      { 'cf-connecting-ip': '203.0.113.9:443' },
      { 'x-forwarded-for': '203.0.113.9' },
      { 'true-client-ip': '203.0.113.9' },
    ]) {
      expect(clientKey('127.0.0.1', headers, true)).toBe('local');
    }
  });

  it('never lets one peer take another peer\'s key', () => {
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '192.168.1.20' }, true)).toBe('visitor:192.168.1.20');
    expect(clientKey('192.168.1.20', {}, true)).toBe('peer:192.168.1.20');
    expect(clientKey('127.0.0.1', { 'cf-connecting-ip': '192.168.1.20' }, true))
      .not.toBe(clientKey('192.168.1.20', {}, true));
    expect(clientKey(undefined, { 'cf-connecting-ip': '203.0.113.9' }, true)).toBe('peer:unknown');
  });

  it('recognises only real loopback peers', () => {
    for (const address of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) expect(isLoopbackPeer(address)).toBe(true);
    for (const address of ['128.0.0.1', '10.0.0.1', '::2', '::ffff:10.0.0.1', '1127.0.0.1', undefined]) {
      expect(isLoopbackPeer(address)).toBe(false);
    }
  });

  it('trusts the tunnel header only for a desktop Host that runs an online room', () => {
    expect(tunnelHeaderTrusted('desktop', { OTB_ONLINE_ROOM_CODE: 'OTB-ABC123' })).toBe(true);
    expect(tunnelHeaderTrusted('desktop', {})).toBe(false);
    expect(tunnelHeaderTrusted('desktop', { OTB_ONLINE_ROOM_CODE: '' })).toBe(false);
    expect(tunnelHeaderTrusted('development', { OTB_ONLINE_ROOM_CODE: 'OTB-ABC123' })).toBe(false);
  });
});
