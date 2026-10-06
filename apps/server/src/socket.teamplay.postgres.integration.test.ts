import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { migrateDatabase } from './persistence/migrate.js';
import { PostgresPersistenceStore } from './persistence/postgres.js';
import {
  assertSupportedRoomSnapshot,
  createFreshPlayer,
  createRoomSnapshot,
  upgradeRoomSnapshotV8ToV9,
  type RoomSnapshot,
} from './rooms.js';
import {
  acceptRescue,
  appearance,
  connect,
  join,
  mutateRoom,
  okOf,
  ready,
  resume,
  setMode,
  start,
  startServer,
  stored,
  useHarnessCleanup,
} from './testing/teamHarness.js';

useHarnessCleanup();

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

/** Runs `body` against a fresh PostgreSQL schema that already has every migration applied. */
async function withSchema(
  body: (context: { pool: Pool; schemaName: string }) => Promise<void>,
): Promise<void> {
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');
  const schemaName = `monopoly_team_${randomUUID().replaceAll('-', '')}`;
  const administrativePool = new Pool({ connectionString: testDatabaseUrl });
  let pool: Pool | undefined;
  try {
    await administrativePool.query(`CREATE SCHEMA "${schemaName}"`);
    pool = new Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schemaName}` });
    await migrateDatabase(pool);
    await body({ pool, schemaName });
  } finally {
    // A persistence store closes the pool it wraps, so the pool may already be ended by the scenario itself.
    if (pool) await pool.end().catch(() => undefined);
    await administrativePool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await administrativePool.end();
  }
}

describe.runIf(Boolean(testDatabaseUrl))('2v2 persistence on PostgreSQL', () => {
  it('upgrades a V8 room in place with SQL migration 010, identically to the pure upgrade helper', async () => {
    await withSchema(async ({ pool }) => {
      // Re-open the version gap: forget migration 010 and put a genuine V8 row in place of whatever exists.
      await pool.query(`DELETE FROM schema_migrations WHERE version = '010_teamplay_v9.sql'`);

      const P1 = randomUUID();
      const P2 = randomUUID();
      const P3 = randomUUID();
      const snapshot = createRoomSnapshot();
      snapshot.members = {
        [P1]: { joinOrder: 2, ready: true, membershipStatus: 'ACTIVE' },
        [P2]: { joinOrder: 5, ready: false, membershipStatus: 'FINISHED' },
        [P3]: { joinOrder: 9, ready: true, membershipStatus: 'ACTIVE' },
      };
      snapshot.nextJoinOrder = 10;
      snapshot.gameState.players = {
        [P1]: createFreshPlayer('One', 'red', 'dog'),
        [P3]: createFreshPlayer('Three', 'blue', 'cat'),
      };
      snapshot.gameState.boardState.finishedPlayers = {
        [P2]: { name: 'Two', color: 'green', characterId: 'panda', teamId: 'TEAM_1', reason: 'BANKRUPT', accountBalance: 0 },
      };
      snapshot.gameState.boardState.players = [P1, P3];
      snapshot.gameState.boardState.gameStarted = true;
      snapshot.gameState.boardState.currentPlayer = { id: P1, hasMoved: false };
      snapshot.gameState.boardState.turnNumber = 4;
      snapshot.gameState.boardState.paymentQueue = {
        operationId: randomUUID(),
        orderedClaims: [{
          claimId: randomUUID(),
          debtorPlayerId: P1,
          creditor: 'BANK',
          amount: 50,
          remainingAmount: 50,
          source: { kind: 'OTHER', description: 'v8 queue' },
          status: 'PENDING',
        }],
        activeClaimIndex: 0,
        continuation: { playerId: P1, turnNumber: 4 },
        actionDeadlineAt: '2030-01-01T00:02:00.000Z',
        rescue: null,
      };
      const v8 = JSON.parse(JSON.stringify(snapshot)) as {
        gameState: {
          players: Record<string, Record<string, unknown>>;
          boardState: Record<string, unknown> & {
            finishedPlayers: Record<string, Record<string, unknown>>;
            paymentQueue: Record<string, unknown>;
          };
        };
      };
      Object.values(v8.gameState.players).forEach((player) => { delete player.teamId; });
      Object.values(v8.gameState.boardState.finishedPlayers).forEach((player) => { delete player.teamId; });
      for (const key of ['gameMode', 'teams', 'teamPlay', 'winningTeamId']) delete v8.gameState.boardState[key];
      delete v8.gameState.boardState.paymentQueue.rescue;

      const roomId = randomUUID();
      await pool.query(
        `INSERT INTO rooms (
           id, code, status, host_player_id, aggregate_version,
           snapshot_schema_version, game_snapshot, next_action_at
         ) VALUES ($1, $2, 'IN_PROGRESS', $3, 3, 8, $4, CURRENT_TIMESTAMP)`,
        [roomId, 'V8-TO-V9', P1, v8],
      );

      expect(await migrateDatabase(pool)).toEqual(['010_teamplay_v9.sql']);

      const persistence = new PostgresPersistenceStore<RoomSnapshot>(pool);
      const migrated = await persistence.rooms.findById(roomId);
      if (!migrated) throw new Error('migrated room is missing');
      expect(migrated.snapshotSchemaVersion).toBe(9);
      expect(migrated.aggregateVersion).toBe(4);
      expect(() => assertSupportedRoomSnapshot(migrated)).not.toThrow();

      // The SQL upgrade and the pure TypeScript helper are the same transformation.
      const expected = upgradeRoomSnapshotV8ToV9({
        snapshotSchemaVersion: 8,
        gameSnapshot: v8,
        hostPlayerId: P1,
        status: 'IN_PROGRESS',
      });
      expect(migrated.gameSnapshot).toEqual(JSON.parse(JSON.stringify(expected.gameSnapshot)));
      expect(migrated.gameSnapshot.gameState.boardState.gameMode).toBe('SOLO');
      expect(migrated.gameSnapshot.gameState.players[P1].teamId).toBe('TEAM_1');
      expect(migrated.gameSnapshot.gameState.boardState.finishedPlayers[P2].teamId).toBe('TEAM_2');
      expect(migrated.gameSnapshot.gameState.players[P3].teamId).toBe('TEAM_1');
      expect(migrated.gameSnapshot.gameState.boardState.paymentQueue?.rescue).toBeNull();

      // Applying the chain again changes nothing.
      expect(await migrateDatabase(pool)).toEqual([]);
      expect(await persistence.rooms.findById(roomId)).toEqual(migrated);
    });
  });

  it('keeps a 2v2 game, a revive window and an open rescue offer across a server restart on the same database', async () => {
    await withSchema(async ({ pool, schemaName }) => {
      if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL is required');
      const first = new PostgresPersistenceStore<RoomSnapshot>(pool);
      const firstServer = await startServer(first);

      const players = [];
      for (const name of ['Harvey', 'Nora', 'Alex', 'Zed']) {
        players.push(await join(await connect(firstServer.url), name, 'PG-TEAMS'));
      }
      const [harvey, nora, alex, zed] = players;
      okOf(await setMode(harvey.socket, 'TEAM_2V2'));
      for (const [index, player] of players.entries()) {
        okOf(await appearance(player.socket, { characterId: (['dog', 'dog', 'cat', 'panda'] as const)[index] }));
        okOf(await ready(player.socket));
      }
      okOf(await start(harvey.socket));
      const roomId = harvey.room.roomId;

      const rescueId = randomUUID();
      const expiresAt = new Date(Date.now() + 60_000).toISOString();
      await mutateRoom(first, roomId, (room) => {
        const state = room.gameSnapshot.gameState;
        // Alex (Team 1) is bankrupt and revivable; Nora (Team 2) is in debt and Zed has been offered the rescue.
        state.boardState.finishedPlayers[alex.playerId] = {
          name: 'Alex', color: 'red', characterId: 'cat', teamId: 'TEAM_1', reason: 'BANKRUPT', accountBalance: 0,
        };
        delete state.players[alex.playerId];
        room.gameSnapshot.members[alex.playerId].membershipStatus = 'FINISHED';
        state.boardState.players = state.boardState.teamPlay.slotOrder.filter((id) => state.players[id]);
        state.boardState.teamPlay.reviveWindows = [{
          playerId: alex.playerId, teamId: 'TEAM_1', turnsRemaining: 2, openedAtTurnNumber: 2,
        }];
        state.boardState.currentPlayer = { id: nora.playerId, hasMoved: true };
        state.boardState.turnNumber = 6;
        state.boardState.ownedProps = {};
        state.turnInfo = {};
        state.players[nora.playerId].accountBalance = 0;
        state.players[zed.playerId].accountBalance = 400;
        state.boardState.paymentQueue = {
          operationId: randomUUID(),
          orderedClaims: [{
            claimId: randomUUID(), debtorPlayerId: nora.playerId, creditor: 'BANK', amount: 150, remainingAmount: 150,
            source: { kind: 'TAX', tileID: 4 }, status: 'PENDING',
          }],
          activeClaimIndex: 0,
          continuation: { playerId: nora.playerId, turnNumber: 6 },
          actionDeadlineAt: expiresAt,
          rescue: {
            rescueId, debtorPlayerId: nora.playerId, rescuerPlayerId: zed.playerId, amount: 150, expiresAt,
          },
        };
        room.nextActionAt = new Date(expiresAt);
      });
      const beforeRestart = await stored(first, roomId);
      assertSupportedRoomSnapshot(beforeRestart);

      await firstServer.close();
      await first.close();

      // A brand-new connection pool and server over the same schema: nothing but the database survives.
      const restartedPool = new Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schemaName}` });
      try {
        await migrateDatabase(restartedPool);
        const second = new PostgresPersistenceStore<RoomSnapshot>(restartedPool);
        const secondServer = await startServer(second);

        const resumedZed = await resume(await connect(secondServer.url), zed.token);
        expect(resumedZed.room.gameState.boardState.paymentShortfall?.rescue).toMatchObject({
          rescueId, rescuerPlayerId: zed.playerId, amount: 150,
        });
        expect(resumedZed.room.gameState.boardState.teamPlay.reviveWindows).toEqual([
          { playerId: alex.playerId, teamId: 'TEAM_1', survivorPlayerId: harvey.playerId, turnsRemaining: 2, openedAtTurnNumber: 2 },
        ]);
        const resumedAlex = await resume(await connect(secondServer.url), alex.token);
        expect(resumedAlex.room.players.find((member) => member.playerId === alex.playerId)).toMatchObject({
          membershipStatus: 'FINISHED', teamId: 'TEAM_1',
        });

        const afterRestart = await stored(second, roomId);
        expect(afterRestart.gameSnapshot.gameState).toEqual(beforeRestart.gameSnapshot.gameState);

        // The restored offer is still live: the rescue is accepted on the new server and committed to PostgreSQL.
        const zedSocket = await connect(secondServer.url);
        await resume(zedSocket, zed.token);
        okOf(await acceptRescue(zedSocket, rescueId));
        const settled = await stored(second, roomId);
        expect(settled.gameSnapshot.gameState.boardState.paymentQueue).toBeNull();
        expect(settled.gameSnapshot.gameState.players[zed.playerId].accountBalance).toBe(250);
        expect(settled.gameSnapshot.gameState.boardState.teamPlay.reviveWindows).toHaveLength(1);
        await second.close();
      } finally {
        await restartedPool.end().catch(() => undefined);
      }
    });
  });
});
