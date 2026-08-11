import { describe, expect, it } from 'vitest';
import {
  clearPlayerSession,
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
  it('stores only the versioned reconnect token', () => {
    const storage = createStorage();
    const token = 'A'.repeat(43);

    expect(writePlayerSession(token, storage)).toBe(true);
    expect(readPlayerSession(storage)).toBe(token);
    expect(JSON.parse(storage.values.get(PLAYER_SESSION_STORAGE_KEY) ?? '{}')).toEqual({
      version: 1,
      token,
    });
  });

  it('rejects malformed and unknown-version records', () => {
    const storage = createStorage();
    storage.setItem(PLAYER_SESSION_STORAGE_KEY, '{not-json');
    expect(readPlayerSession(storage)).toBeNull();

    storage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({ version: 2, token: 'old' }));
    expect(readPlayerSession(storage)).toBeNull();

    storage.setItem(PLAYER_SESSION_STORAGE_KEY, JSON.stringify({ version: 1, token: 'short' }));
    expect(readPlayerSession(storage)).toBeNull();
    expect(writePlayerSession('contains spaces and is still too short', storage)).toBe(false);
  });

  it('clears the reconnect token', () => {
    const storage = createStorage();
    writePlayerSession('B'.repeat(43), storage);
    clearPlayerSession(storage);
    expect(readPlayerSession(storage)).toBeNull();
  });
});
