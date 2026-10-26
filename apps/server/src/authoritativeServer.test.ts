import { describe, expect, it } from 'vitest';
import { resolveListenerHost } from './authoritativeServer.js';

describe('authoritative server listener policy', () => {
  it('preserves the production listener default when local acceptance is disabled', () => {
    expect(resolveListenerHost(undefined, '0.0.0.0', {})).toBe('0.0.0.0');
  });

  it('permits only 127.0.0.1 when local acceptance is enabled', () => {
    const environment = { OTB_LOOPBACK_ACCEPTANCE_MODE: '1' };
    expect(resolveListenerHost('127.0.0.1', '0.0.0.0', environment)).toBe('127.0.0.1');
    for (const host of ['0.0.0.0', '::', '192.168.1.15', 'localhost']) {
      expect(() => resolveListenerHost(host, '127.0.0.1', environment)).toThrow('requires the server to bind');
    }
    expect(() => resolveListenerHost(undefined, '0.0.0.0', environment)).toThrow('requires the server to bind');
  });
});
