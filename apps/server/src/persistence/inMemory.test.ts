import { describe, expect, it } from 'vitest';

import { InMemoryPersistenceStore } from './inMemory.js';

describe('in-memory session retention adapter', () => {
  it('purges terminal sessions only after the retention cutoff', async () => {
    const store = new InMemoryPersistenceStore<Record<string, unknown>>();
    const now = new Date('2026-08-09T12:00:00.000Z');
    const expiredAt = new Date('2026-08-01T12:00:00.000Z');

    await store.playerSessions.createPending({
      id: 'session-1',
      tokenHash: new Uint8Array(32).fill(1),
      requestedRoomCode: 'ROOM-1',
      requestedName: 'Ada',
      expiresAt: expiredAt,
    });
    expect(await store.playerSessions.expireDue(now, 10)).toBe(1);
    expect(await store.playerSessions.purgeTerminal(
      new Date('2026-07-31T12:00:00.000Z'),
      10,
    )).toBe(0);
    expect(await store.playerSessions.purgeTerminal(
      new Date('2026-08-02T12:00:00.000Z'),
      10,
    )).toBe(1);
    expect(await store.playerSessions.findById('session-1')).toBeNull();
  });
});
