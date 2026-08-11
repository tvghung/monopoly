import { describe, expect, it } from 'vitest';

import { InMemoryPersistenceStore } from '../persistence/inMemory.js';
import { RoomCommandExecutor } from './roomCommandExecutor.js';

interface TestSnapshot {
  counter: number;
  history: string[];
}

const ROOM_ID = '00000000-0000-4000-8000-000000000001';

async function createSubject(): Promise<{
  persistence: InMemoryPersistenceStore<TestSnapshot>;
  executor: RoomCommandExecutor<TestSnapshot>;
}> {
  const persistence = new InMemoryPersistenceStore<TestSnapshot>();
  await persistence.rooms.create({
    id: ROOM_ID,
    code: 'room-1',
    status: 'LOBBY',
    snapshotSchemaVersion: 1,
    gameSnapshot: { counter: 0, history: [] },
  });
  return {
    persistence,
    executor: new RoomCommandExecutor(persistence),
  };
}

describe('RoomCommandExecutor', () => {
  it('commits a cloned aggregate and increments its version', async () => {
    const { executor, persistence } = await createSubject();

    const commit = await executor.execute(ROOM_ID, (context) => {
      context.room.gameSnapshot.counter += 1;
      context.room.gameSnapshot.history.push('first command');
      context.touchActivity(new Date('2026-08-09T00:00:00.000Z'));
      return 'ok';
    });

    expect(commit.result).toBe('ok');
    expect(commit.room).toMatchObject({ aggregateVersion: 2 });
    expect(commit.room?.gameSnapshot).toEqual({
      counter: 1,
      history: ['first command'],
    });
    expect((await persistence.rooms.findById(ROOM_ID))?.gameSnapshot).toEqual(
      commit.room?.gameSnapshot,
    );
  });

  it('discards the draft when a command fails', async () => {
    const { executor, persistence } = await createSubject();

    await expect(
      executor.execute(ROOM_ID, ({ room }) => {
        room.gameSnapshot.counter = 99;
        throw new Error('command failed');
      }),
    ).rejects.toThrow('command failed');

    expect(await persistence.rooms.findById(ROOM_ID)).toMatchObject({
      aggregateVersion: 1,
      gameSnapshot: { counter: 0, history: [] },
    });
  });

  it('serializes commands for the same room', async () => {
    const { executor } = await createSubject();
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = executor.execute(ROOM_ID, async ({ room }) => {
      room.gameSnapshot.history.push('first-start');
      await firstCanFinish;
      room.gameSnapshot.history.push('first-end');
    });
    const second = executor.execute(ROOM_ID, ({ room }) => {
      room.gameSnapshot.history.push('second');
    });

    await Promise.resolve();
    releaseFirst();
    const [, secondCommit] = await Promise.all([first, second]);

    expect(secondCommit.room?.aggregateVersion).toBe(3);
    expect(secondCommit.room?.gameSnapshot.history).toEqual([
      'first-start',
      'first-end',
      'second',
    ]);
  });

  it('holds the room queue through a validation-only after-commit binding', async () => {
    const { executor, persistence } = await createSubject();
    const order: string[] = [];
    let releaseBinding!: () => void;
    let markBindingStarted!: () => void;
    const bindingCanFinish = new Promise<void>((resolve) => {
      releaseBinding = resolve;
    });
    const bindingStarted = new Promise<void>((resolve) => {
      markBindingStarted = resolve;
    });

    const validation = executor.execute(
      ROOM_ID,
      () => 'validated',
      {
        persistRoom: false,
        afterCommit: async () => {
          order.push('binding-start');
          markBindingStarted();
          await bindingCanFinish;
          order.push('binding-end');
        },
      },
    );
    await bindingStarted;
    const queued = executor.execute(ROOM_ID, ({ room }) => {
      order.push('next-command');
      room.gameSnapshot.counter += 1;
    });
    await Promise.resolve();
    expect(order).toEqual(['binding-start']);

    releaseBinding();
    const [validated, committed] = await Promise.all([validation, queued]);
    expect(order).toEqual(['binding-start', 'binding-end', 'next-command']);
    expect(validated.room?.aggregateVersion).toBe(1);
    expect(committed.room?.aggregateVersion).toBe(2);
    expect(await persistence.rooms.findById(ROOM_ID)).toMatchObject({
      aggregateVersion: 2,
      gameSnapshot: { counter: 1 },
    });
  });

  it('rolls back related repository writes with a failed room command', async () => {
    const { executor, persistence } = await createSubject();
    const tokenHash = new Uint8Array(32).fill(7);

    await expect(
      executor.execute(ROOM_ID, async ({ transaction }) => {
        await transaction.playerSessions.createPending({
          id: '00000000-0000-4000-8000-000000000002',
          tokenHash,
          requestedRoomCode: 'room-1',
          requestedName: 'Ada',
          expiresAt: new Date(Date.now() + 60_000),
        });
        throw new Error('do not commit');
      }),
    ).rejects.toThrow('do not commit');

    expect(await persistence.playerSessions.findByTokenHash(tokenHash)).toBeNull();
  });

  it('can delete a room without attempting a later save', async () => {
    const { executor, persistence } = await createSubject();

    const commit = await executor.execute(ROOM_ID, (context) => {
      context.deleteRoom();
      return 'deleted';
    });

    expect(commit).toEqual({ room: null, result: 'deleted' });
    expect(await persistence.rooms.findById(ROOM_ID)).toBeNull();
  });
});
