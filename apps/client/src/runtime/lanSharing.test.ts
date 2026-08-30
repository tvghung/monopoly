import { describe, expect, it } from 'vitest';

import {
  buildLanJoinUrl,
  generateHostRoomCode,
  normalizeRoomCode,
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
