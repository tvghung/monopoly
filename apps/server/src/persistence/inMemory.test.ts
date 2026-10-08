import { describe, expect, it } from 'vitest';

import { InMemoryPersistenceStore } from './inMemory.js';

describe('in-memory session retention adapter', () => {
  it('rolls back a failed draft and serializes a concurrent direct write', async () => {
    const store = new InMemoryPersistenceStore<{ marker: string }>();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const create = (id: string) => ({
      id, code: id, status: 'LOBBY' as const, snapshotSchemaVersion: 10,
      gameSnapshot: { marker: id },
    });
    const failed = store.transaction(async transaction => {
      await transaction.rooms.create(create('FAILED'));
      started();
      await gate;
      throw new Error('abort');
    });
    await entered;
    const succeeding = store.rooms.create(create('COMMITTED'));
    expect(await store.rooms.findByCode('FAILED')).toBeNull();
    release();
    await expect(failed).rejects.toThrow('abort');
    await expect(succeeding).resolves.toMatchObject({ code: 'COMMITTED', aggregateVersion: 1 });
    expect(await store.rooms.findByCode('FAILED')).toBeNull();
    expect(await store.rooms.findByCode('COMMITTED')).not.toBeNull();
  });

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
