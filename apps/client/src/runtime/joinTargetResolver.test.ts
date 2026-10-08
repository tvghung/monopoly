import { describe, expect, it } from 'vitest';
import { parseJoinInput, publicHttpsEndpoint } from './joinTargetResolver';

describe('join target resolution', () => {
  it('accepts legacy codes, LAN links, and verified Quick Tunnel links', () => {
    expect(parseJoinInput(' otb-abc234 ')).toEqual({ kind: 'code', roomCode: 'OTB-ABC234' });
    expect(parseJoinInput('http://192.168.1.25:8080/?room=otb-abc234')).toEqual({
      kind: 'invitation', endpoint: 'http://192.168.1.25:8080', roomCode: 'OTB-ABC234',
    });
    expect(parseJoinInput('https://sample-host.trycloudflare.com/?room=OTB-ABC234')).toEqual({
      kind: 'invitation', endpoint: 'https://sample-host.trycloudflare.com', roomCode: 'OTB-ABC234',
    });
  });

  it('rejects unsafe or ambiguous URLs without joining', () => {
    for (const value of [
      'https://example.com/?room=OTB-ABC234',
      'https://user:pass@sample.trycloudflare.com/?room=OTB-ABC234',
      'https://sample.trycloudflare.com/elsewhere?room=OTB-ABC234',
      'https://sample.trycloudflare.com/?room=ONE&room=TWO',
      'http://sample.trycloudflare.com/?room=OTB-ABC234',
      'javascript:alert(1)',
    ]) expect(parseJoinInput(value).kind).toBe('invalid');
    expect(publicHttpsEndpoint('https://sample.trycloudflare.com')).toBe('https://sample.trycloudflare.com');
    expect(publicHttpsEndpoint('https://sample.trycloudflare.com.evil.test')).toBeUndefined();
  });
});
