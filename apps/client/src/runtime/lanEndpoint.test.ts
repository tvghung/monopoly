import { describe, expect, it } from 'vitest';

import { normalizeLanEndpoint } from './lanEndpoint';

describe('normalizeLanEndpoint', () => {
  it('normalizes private IPv4 endpoints and supplies the LAN port', () => {
    expect(normalizeLanEndpoint('192.168.1.15')).toBe('http://192.168.1.15:8080');
    expect(normalizeLanEndpoint('http://10.0.0.4:43123/')).toBe('http://10.0.0.4:43123');
  });

  it('rejects public, credential-bearing, and non-http endpoints', () => {
    expect(normalizeLanEndpoint('8.8.8.8:8080')).toBeUndefined();
    expect(normalizeLanEndpoint('http://user:secret@192.168.1.15:8080')).toBeUndefined();
    expect(normalizeLanEndpoint('https://192.168.1.15:8080')).toBeUndefined();
    expect(normalizeLanEndpoint('http://192.168.1.15:8080/game')).toBeUndefined();
  });
});
