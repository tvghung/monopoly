import { describe, expect, it } from 'vitest';

import {
  buildLanJoinUrl,
  generateHostRoomCode,
  normalizeRoomCode,
  parseLanJoinUrl,
  roomCodeFromLocation,
} from './lanSharing';

describe('LAN sharing', () => {
  it('generates the public OTB room-code format without ambiguous characters', () => {
    const random = {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set([0, 1, 2, 3, 4, 5]);
        return bytes;
      },
    };

    expect(generateHostRoomCode(random as Crypto)).toBe('OTB-ABCDEF');
  });

  it('builds the canonical credential-free join URL and reads only a valid room query', () => {
    expect(buildLanJoinUrl('http://192.168.1.15:53120', 'otb-abc234'))
      .toBe('http://192.168.1.15:53120/?room=OTB-ABC234');
    expect(roomCodeFromLocation({ search: '?room=otb-abc234&token=secret' }))
      .toBe('OTB-ABC234');
    expect(normalizeRoomCode('bad room')).toBeUndefined();
  });
});

describe('parseLanJoinUrl', () => {
  it.each([
    ['http://192.168.1.15:53120', 'otb-abc234'],
    ['http://10.0.0.8:43123', 'OTB-XYZ789'],
    ['http://172.16.4.2:8080', 'LAN-1234'],
    ['http://100.64.0.4:65535', 'A'],
  ])('is the inverse of buildLanJoinUrl for %s and %s', (endpoint, roomCode) => {
    expect(parseLanJoinUrl(buildLanJoinUrl(endpoint, roomCode))).toEqual({
      endpoint,
      roomCode: roomCode.toUpperCase(),
    });
  });

  it('forgives what people do when they paste: spaces, a missing scheme and a lower-case code', () => {
    const expected = { endpoint: 'http://192.168.1.25:53120', roomCode: 'OTB-ABC234' };

    expect(parseLanJoinUrl('  http://192.168.1.25:53120/?room=OTB-ABC234\n')).toEqual(expected);
    expect(parseLanJoinUrl('192.168.1.25:53120/?room=otb-abc234')).toEqual(expected);
    expect(parseLanJoinUrl('HTTP://192.168.1.25:53120/?room=otb-abc234')).toEqual(expected);
  });

  it('reads only the address, the port and the room: other values and the fragment are ignored', () => {
    expect(parseLanJoinUrl('http://192.168.1.25:53120/?token=secret&room=OTB-ABC234&utm=x#section')).toEqual({
      endpoint: 'http://192.168.1.25:53120',
      roomCode: 'OTB-ABC234',
    });
  });

  it.each([
    ['nothing', ''],
    ['only spaces', '   '],
    ['plain text', 'Vào phòng OTB-ABC234 nhé'],
    ['a room code alone', 'OTB-ABC234'],
    ['an address without a room', 'http://192.168.1.25:53120'],
    ['an address with an empty room', 'http://192.168.1.25:53120/?room='],
    ['a room with a space', 'http://192.168.1.25:53120/?room=OTB%20ABC'],
    ['a room with a symbol', 'http://192.168.1.25:53120/?room=OTB_ABC'],
    ['a 21-character room', `http://192.168.1.25:53120/?room=${'A'.repeat(21)}`],
    ['no port', 'http://192.168.1.25/?room=OTB-ABC234'],
    ['port zero', 'http://192.168.1.25:0/?room=OTB-ABC234'],
    ['an out-of-range port', 'http://192.168.1.25:70000/?room=OTB-ABC234'],
    ['https', 'https://192.168.1.25:53120/?room=OTB-ABC234'],
    ['another scheme', 'ftp://192.168.1.25:53120/?room=OTB-ABC234'],
    ['a script URL', 'javascript:alert(1)//?room=OTB-ABC234'],
    ['credentials', 'http://user:secret@192.168.1.25:53120/?room=OTB-ABC234'],
    ['a user name only', 'http://user@192.168.1.25:53120/?room=OTB-ABC234'],
    ['another path', 'http://192.168.1.25:53120/game?room=OTB-ABC234'],
    ['a host name', 'http://example.com:53120/?room=OTB-ABC234'],
    ['a loopback address', 'http://127.0.0.1:53120/?room=OTB-ABC234'],
    ['a link-local address', 'http://169.254.1.4:53120/?room=OTB-ABC234'],
    ['the unspecified address', 'http://0.0.0.0:53120/?room=OTB-ABC234'],
    ['an IPv6 address', 'http://[fe80::1]:53120/?room=OTB-ABC234'],
    ['a very long text', `http://192.168.1.25:53120/?room=OTB-ABC234&pad=${'x'.repeat(400)}`],
  ])('refuses %s', (_name, value) => {
    expect(parseLanJoinUrl(value)).toBeUndefined();
  });
});
