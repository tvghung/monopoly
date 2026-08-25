import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { migrateDatabase } from './migrate.js';
import { PostgresPersistenceStore } from './postgres.js';
import { RoomVersionConflictError } from './types.js';

interface TestSnapshot {
  value: number;
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(testDatabaseUrl))('PostgresPersistenceStore', () => {
  const schemaName = `monopoly_test_${randomUUID().replaceAll('-', '')}`;
  let administrativePool: Pool;
  let applicationPool: Pool;
  let persistence: PostgresPersistenceStore<TestSnapshot>;

  beforeAll(async () => {
    administrativePool = new Pool({ connectionString: testDatabaseUrl });
    await administrativePool.query(`CREATE SCHEMA "${schemaName}"`);

    applicationPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schemaName}`,
    });
    await migrateDatabase(applicationPool);
    persistence = new PostgresPersistenceStore<TestSnapshot>(applicationPool);
  });

  afterAll(async () => {
    await persistence?.close();
    await administrativePool?.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    await administrativePool?.end();
  });

  it('round-trips and compare-and-swaps a room aggregate', async () => {
    await expect(persistence.healthcheck()).resolves.toBeUndefined();
    const roomId = randomUUID();
    const created = await persistence.rooms.create({
      id: roomId,
      code: 'postgres-room',
      status: 'LOBBY',
      snapshotSchemaVersion: 1,
      gameSnapshot: { value: 1 },
    });

    const saved = await persistence.rooms.save({
      id: roomId,
      expectedVersion: created.aggregateVersion,
      status: 'IN_PROGRESS',
      hostPlayerId: randomUUID(),
      snapshotSchemaVersion: 1,
      gameSnapshot: { value: 2 },
      nextActionAt: null,
      lastActivityAt: new Date(),
      expiresAt: null,
    });

    expect(saved.aggregateVersion).toBe(2);
    expect(saved.gameSnapshot).toEqual({ value: 2 });
    await expect(
      persistence.rooms.save({
        id: roomId,
        expectedVersion: 1,
        status: saved.status,
        hostPlayerId: saved.hostPlayerId,
        snapshotSchemaVersion: 1,
        gameSnapshot: { value: 3 },
        nextActionAt: null,
        lastActivityAt: new Date(),
        expiresAt: null,
      }),
    ).rejects.toBeInstanceOf(RoomVersionConflictError);
  });

  it('migrates a V6 room through V8 without changing existing facts', async () => {
    await applicationPool.query(
      'DELETE FROM schema_migrations WHERE version = ANY($1::text[])',
      [['008_semantic_card_v7.sql', '009_activity_feed_v8.sql']],
    );
    const roomId = randomUUID();
    const v6Snapshot = {
      members: {},
      nextJoinOrder: 1,
      gameState: {
        boardState: { rollSequence: 9, logs: ['durable-v6-fact'] },
        players: {},
        turnInfo: {},
        privateState: { decks: { chance: { drawPile: [] }, chest: { drawPile: [] } } },
      },
    };
    await applicationPool.query(
      `INSERT INTO rooms (id, code, status, snapshot_schema_version, game_snapshot)
       VALUES ($1, $2, 'LOBBY', 6, $3::jsonb)`,
      [roomId, 'V6-V8-MIGRATION', JSON.stringify(v6Snapshot)],
    );

    await expect(migrateDatabase(applicationPool)).resolves.toEqual([
      '008_semantic_card_v7.sql',
      '009_activity_feed_v8.sql',
    ]);
    const result = await applicationPool.query<{
      snapshot_schema_version: number;
      aggregate_version: string;
      game_snapshot: typeof v6Snapshot & {
        gameState: typeof v6Snapshot.gameState & {
          boardState: typeof v6Snapshot.gameState.boardState & {
            gameplayEvents: unknown;
            activityFeed: unknown;
          };
          privateState: typeof v6Snapshot.gameState.privateState & {
            privateGameplayEventsByPlayer: unknown;
            completedCardOperations: unknown;
          };
        };
      };
    }>(
      'SELECT snapshot_schema_version, aggregate_version, game_snapshot FROM rooms WHERE id = $1',
      [roomId],
    );
    const migrated = result.rows[0];
    expect(migrated).toMatchObject({ snapshot_schema_version: 8, aggregate_version: '3' });
    expect(migrated?.game_snapshot.gameState.boardState).toMatchObject({
      rollSequence: 9,
      logs: ['durable-v6-fact'],
      gameplayEvents: { sequence: 0, events: [] },
      activityFeed: { sequence: 0, events: [] },
    });
    expect(migrated?.game_snapshot.gameState.privateState).toMatchObject({
      privateGameplayEventsByPlayer: {},
      completedCardOperations: [],
    });
  });

  it('stores and looks up only a token digest through the repository', async () => {
    const tokenHash = new Uint8Array(32).fill(23);
    const session = await persistence.playerSessions.createPending({
      id: randomUUID(),
      tokenHash,
      requestedRoomCode: 'postgres-room',
      requestedName: 'Grace',
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(session).not.toHaveProperty('tokenHash');
    expect(await persistence.playerSessions.findByTokenHash(tokenHash)).toEqual(
      session,
    );
  });

  it('rolls back all writes when a transaction fails', async () => {
    const sessionId = randomUUID();
    const tokenHash = new Uint8Array(32).fill(42);

    await expect(
      persistence.transaction(async ({ playerSessions }) => {
        await playerSessions.createPending({
          id: sessionId,
          tokenHash,
          requestedRoomCode: 'postgres-room',
          requestedName: 'Linus',
          expiresAt: new Date(Date.now() + 60_000),
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(await persistence.playerSessions.findById(sessionId)).toBeNull();
  });

  it('expires and purges terminal admission sessions', async () => {
    const sessionId = randomUUID();
    const now = new Date();
    await persistence.playerSessions.createPending({
      id: sessionId,
      tokenHash: new Uint8Array(32).fill(66),
      requestedRoomCode: 'postgres-room',
      requestedName: 'Expired',
      expiresAt: new Date(now.getTime() - 60_000),
    });

    expect(await persistence.playerSessions.expireDue(now, 10)).toBe(1);
    expect(await persistence.playerSessions.purgeTerminal(
      new Date(now.getTime() + 1),
      10,
    )).toBe(1);
    expect(await persistence.playerSessions.findById(sessionId)).toBeNull();
  });
});
