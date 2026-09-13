import { describe, expect, it } from 'vitest';

import { normalizeLanEndpoint } from './lanEndpoint';

describe('normalizeLanEndpoint', () => {
  it('normalizes usable IPv4 endpoints with an explicit port', () => {
    expect(normalizeLanEndpoint('192.168.1.15:53120')).toBe('http://192.168.1.15:53120');
    expect(normalizeLanEndpoint('http://10.0.0.4:43123/')).toBe('http://10.0.0.4:43123');
    expect(normalizeLanEndpoint('100.64.0.4:43123')).toBe('http://100.64.0.4:43123');
  });

  it('rejects unusable, credential-bearing, and non-http endpoints', () => {
    expect(normalizeLanEndpoint('192.168.1.15')).toBeUndefined();
    expect(normalizeLanEndpoint('127.0.0.1:8080')).toBeUndefined();
    expect(normalizeLanEndpoint('169.254.1.4:8080')).toBeUndefined();
    expect(normalizeLanEndpoint('http://user:secret@192.168.1.15:8080')).toBeUndefined();
    expect(normalizeLanEndpoint('https://192.168.1.15:8080')).toBeUndefined();
    expect(normalizeLanEndpoint('http://192.168.1.15:8080/game')).toBeUndefined();
  });
});
