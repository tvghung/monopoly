import { describe, expect, it } from 'vitest';
import {
  clearPlayerSession,
  getSessionAuthority,
  PLAYER_SESSION_STORAGE_KEY,
  readPlayerSession,
  writePlayerSession,
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

describe('playerSessionStorage', () => {
  it('stores a reconnect token under its authority', () => {
    const storage = createStorage();
    const token = 'A'.repeat(43);
    const authority = 'http://host-a:8080';

    expect(writePlayerSession(token, authority, storage)).toBe(true);
    expect(readPlayerSession(authority, storage)).toBe(token);
    expect(JSON.parse(storage.values.get(PLAYER_SESSION_STORAGE_KEY) ?? '{}')).toEqual({
      version: 2,
      sessions: { [getSessionAuthority(authority) as string]: token },
    });
  });

  it('migrates a legacy web record and rejects malformed records', () => {
    const storage = createStorage();
    storage.setItem('monopoly.player-session.v1', JSON.stringify({ version: 1, token: 'A'.repeat(43) }));
    expect(readPlayerSession('http://host-a:8080', storage)).toBe('A'.repeat(43));
    expect(storage.values.has('monopoly.player-session.v1')).toBe(false);

    storage.setItem(PLAYER_SESSION_STORAGE_KEY, '{not-json');
    expect(readPlayerSession('http://host-a:8080', storage)).toBeNull();
    expect(writePlayerSession('contains spaces and is still too short', 'http://host-a:8080', storage)).toBe(false);
  });

  it('clears the reconnect token', () => {
    const storage = createStorage();
    const authority = 'http://host-a:8080';
    writePlayerSession('B'.repeat(43), authority, storage);
    clearPlayerSession(authority, storage);
    expect(readPlayerSession(authority, storage)).toBeNull();
  });

  it('never returns a token for a different host authority', () => {
    const storage = createStorage();
    writePlayerSession('A'.repeat(43), 'http://host-a:8080', storage);
    writePlayerSession('B'.repeat(43), 'http://host-b:8080', storage);

    expect(readPlayerSession('http://host-a:8080', storage)).toBe('A'.repeat(43));
    expect(readPlayerSession('http://host-b:8080', storage)).toBe('B'.repeat(43));
    expect(readPlayerSession('http://host-c:8080', storage)).toBeNull();
  });
});
