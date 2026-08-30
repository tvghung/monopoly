import { describe, expect, it } from 'vitest';
import {
  clearPlayerSession,
  getSessionAuthority,
  PLAYER_SESSION_STORAGE_KEY,
  readPlayerSession,
  readPlayerSessionForRoom,
  writePlayerSessionForRoom,
} from './playerSessionStorage';

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}

const TOKEN_A = 'A'.repeat(43);
const TOKEN_B = 'B'.repeat(43);
const AUTHORITY_A = 'http://host-a:8080';
const AUTHORITY_B = 'http://host-b:8080';

describe('playerSessionStorage', () => {
  it('stores a reconnect token under its authority and canonical room', () => {
    const storage = createStorage();

    expect(writePlayerSessionForRoom(TOKEN_A, AUTHORITY_A, 'lan-abc123', storage)).toBe(true);
    expect(readPlayerSessionForRoom(AUTHORITY_A, 'LAN-ABC123', storage)).toBe(TOKEN_A);
    expect(JSON.parse(storage.values.get(PLAYER_SESSION_STORAGE_KEY) ?? '{}')).toEqual({
      version: 3,
      sessions: {
        [getSessionAuthority(AUTHORITY_A) as string]: { token: TOKEN_A, roomCode: 'LAN-ABC123' },
      },
    });
  });

  it('returns a token only for the same authority and room', () => {
    const storage = createStorage();
    writePlayerSessionForRoom(TOKEN_A, AUTHORITY_A, 'LAN-ABC123', storage);

    expect(readPlayerSessionForRoom(AUTHORITY_A, 'lan-abc123', storage)).toBe(TOKEN_A);
    expect(readPlayerSessionForRoom(AUTHORITY_A, 'LAN-OTHER', storage)).toBeNull();
    expect(readPlayerSessionForRoom(AUTHORITY_B, 'LAN-ABC123', storage)).toBeNull();
  });

  it('migrates V2 authority-only records as unscoped generic sessions', () => {
    const storage = createStorage();
    storage.setItem('monopoly.player-session.v2', JSON.stringify({
      version: 2,
      sessions: { [AUTHORITY_A]: TOKEN_A },
    }));

    expect(readPlayerSession(AUTHORITY_A, storage)).toBe(TOKEN_A);
    expect(readPlayerSessionForRoom(AUTHORITY_A, 'LAN-ABC123', storage)).toBeNull();
    expect(JSON.parse(storage.values.get(PLAYER_SESSION_STORAGE_KEY) ?? '{}')).toEqual({
      version: 3,
      sessions: { [AUTHORITY_A]: { token: TOKEN_A, roomCode: null } },
    });
  });

  it('does not accept an unscoped V2 record for an explicit room lookup', () => {
    const storage = createStorage();
    storage.setItem('monopoly.player-session.v2', JSON.stringify({
      version: 2,
      sessions: { [AUTHORITY_A]: TOKEN_A },
    }));

    expect(readPlayerSessionForRoom(AUTHORITY_A, 'LAN-ABC123', storage)).toBeNull();
    expect(storage.values.has('monopoly.player-session.v2')).toBe(true);
  });

  it('migrates a valid V1 record for generic restore but keeps it unscoped', () => {
    const storage = createStorage();
    storage.setItem('monopoly.player-session.v1', JSON.stringify({ version: 1, token: TOKEN_A }));

    expect(readPlayerSession(AUTHORITY_A, storage)).toBe(TOKEN_A);
    expect(readPlayerSessionForRoom(AUTHORITY_A, 'LAN-ABC123', storage)).toBeNull();
    expect(storage.values.has('monopoly.player-session.v1')).toBe(false);
  });

  it('ignores malformed room/session records without throwing', () => {
    const storage = createStorage();
    storage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({
      version: 3,
      sessions: {
        [AUTHORITY_A]: { token: TOKEN_A, roomCode: 'not a room' },
        [AUTHORITY_B]: { token: 'bad token', roomCode: 'LAN-OK' },
      },
    }));

    expect(() => readPlayerSession(AUTHORITY_A, storage)).not.toThrow();
    expect(readPlayerSession(AUTHORITY_A, storage)).toBeNull();
    expect(readPlayerSessionForRoom(AUTHORITY_B, 'LAN-OK', storage)).toBeNull();

    storage.setItem('monopoly.player-session.v2', '{not-json');
    expect(() => clearPlayerSession(AUTHORITY_A, storage)).not.toThrow();
  });

  it('keeps authority isolation and the maximum-authority limit', () => {
    const storage = createStorage();
    for (let index = 0; index < 9; index += 1) {
      writePlayerSessionForRoom(
        TOKEN_A,
        `http://host-${String(index)}:8080`,
        'LAN-ROOM',
        storage,
      );
    }

    const record = JSON.parse(storage.values.get(PLAYER_SESSION_STORAGE_KEY) ?? '{}') as {
      sessions?: Record<string, unknown>;
    };
    expect(Object.keys(record.sessions ?? {})).toHaveLength(8);
    expect(readPlayerSessionForRoom(AUTHORITY_B, 'LAN-ROOM', storage)).toBeNull();
  });

  it('treats storage failures as non-fatal', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };

    expect(readPlayerSession(AUTHORITY_A, storage)).toBeNull();
    expect(readPlayerSessionForRoom(AUTHORITY_A, 'LAN-ROOM', storage)).toBeNull();
    expect(writePlayerSessionForRoom(TOKEN_B, AUTHORITY_A, 'LAN-ROOM', storage)).toBe(false);
    expect(() => clearPlayerSession(AUTHORITY_A, storage)).not.toThrow();
  });
});
