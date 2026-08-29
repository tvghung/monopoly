import { randomBytes, randomUUID } from 'node:crypto';

import { Pool, type PoolClient } from 'pg';

import type { DatabaseConfig } from './config.js';
import {
  createMigrationPool,
  loadMigrationFiles,
  migrateDatabase,
} from './persistence/migrate.js';
import { PostgresPersistenceStore } from './persistence/postgres.js';
import { RoomVersionConflictError } from './persistence/types.js';

const CONTRACT_TIMEOUT_MS = 5_000;

export interface Phase7ContractOptions {
  connectionString: string;
  migrationDirectory: string;
  expectedRoomId?: string;
  timeoutMs?: number;
}

export interface Phase7ContractResult {
  pass: true;
  roomId: string;
  marker: string;
  aggregateVersion: number;
  checks: Record<string, true>;
  database: {
    majorVersion: string;
    listenAddresses: string;
    port: number;
  };
}

function databaseConfig(connectionString: string): DatabaseConfig {
  return {
    connectionString,
    ssl: false,
    rejectUnauthorized: true,
    maxConnections: 10,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function setShortStatementTimeout(client: PoolClient, timeoutMs: number): Promise<void> {
  await client.query('SELECT set_config($1, $2, false)', [
    'statement_timeout',
    `${String(timeoutMs)}ms`,
  ]);
}

async function checkIndependentTransactions(
  pool: Pool,
  roomId: string,
  sessionId: string,
  timeoutMs: number,
): Promise<void> {
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    await withTimeout(first.query('BEGIN'), timeoutMs, 'first transaction begin');
    await withTimeout(second.query('BEGIN'), timeoutMs, 'second transaction begin');
    await setShortStatementTimeout(first, timeoutMs);
    await setShortStatementTimeout(second, timeoutMs);
    await first.query('SELECT id FROM rooms WHERE id = $1 FOR UPDATE', [roomId]);
    await first.query('SELECT id FROM player_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
    const skipped = await withTimeout(
      second.query('SELECT id FROM player_sessions WHERE id = $1 FOR UPDATE SKIP LOCKED', [sessionId]),
      timeoutMs,
      'skip-locked transaction query',
    );
    if (skipped.rowCount !== 0) throw new Error('FOR UPDATE SKIP LOCKED did not skip the locked row');
    await first.query('ROLLBACK');
    await second.query('ROLLBACK');
  } finally {
    await first.query('ROLLBACK').catch(() => undefined);
    await second.query('ROLLBACK').catch(() => undefined);
    first.release();
    second.release();
  }
}

export async function runNativePostgresContract(
  options: Phase7ContractOptions,
): Promise<Phase7ContractResult> {
  const timeoutMs = options.timeoutMs ?? CONTRACT_TIMEOUT_MS;
  const config = databaseConfig(options.connectionString);
  const migrationPool = createMigrationPool(config);
  try {
    await migrateDatabase(migrationPool, options.migrationDirectory);
  } finally {
    await migrationPool.end();
  }

  const pool = new Pool({
    connectionString: options.connectionString,
    max: config.maxConnections,
  });
  const persistence = new PostgresPersistenceStore<Record<string, unknown>>(pool);
  const checks: Record<string, true> = {};
  const check = (name: string, condition: boolean, message: string): void => {
    if (!condition) throw new Error(`${name}: ${message}`);
    checks[name] = true;
  };

  try {
    const server = await pool.query<{
      server_version: string;
      listen_addresses: string;
      port: string;
    }>(`
      SELECT current_setting('server_version') AS server_version,
             current_setting('listen_addresses') AS listen_addresses,
             current_setting('port') AS port
    `);
    const serverRow = server.rows[0];
    if (!serverRow) throw new Error('PostgreSQL server settings were not returned');
    const majorVersion = serverRow.server_version.split('.')[0] ?? '';
    check('postgres-major-17', majorVersion === '17', `expected major 17, got ${serverRow.server_version}`);
    check('loopback-listen-address', serverRow.listen_addresses === '127.0.0.1', `got ${serverRow.listen_addresses}`);

    const migrations = await loadMigrationFiles(options.migrationDirectory);
    const applied = await pool.query<{ version: string; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version',
    );
    const appliedByVersion = new Map(applied.rows.map(row => [row.version, row.checksum]));
    check(
      'migrations-001-009',
      migrations.length === 9
        && migrations.every(migration => appliedByVersion.get(migration.version) === migration.checksum),
      'migration versions or checksums do not match the packaged SQL',
    );
    await persistence.healthcheck();
    checks['schema-healthcheck'] = true;

    const advisory = await pool.connect();
    try {
      const lock = await advisory.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
        ['phase7-runtime-proof'],
      );
      check('advisory-lock', lock.rows[0]?.locked === true, 'advisory lock was not acquired');
      await advisory.query('SELECT pg_advisory_unlock(hashtext($1))', ['phase7-runtime-proof']);
    } finally {
      advisory.release();
    }

    const typedId = randomUUID();
    const typedAt = new Date();
    const typed = await pool.query<{ id: string; bytes: Buffer; recorded_at: Date }>(
      'SELECT $1::uuid AS id, $2::bytea AS bytes, $3::timestamptz AS recorded_at',
      [typedId, Buffer.from([7, 8, 9]), typedAt],
    );
    check('typed-postgres-values', typed.rows[0]?.id === typedId
      && Buffer.isBuffer(typed.rows[0]?.bytes)
      && typed.rows[0]?.bytes.equals(Buffer.from([7, 8, 9]))
      && typed.rows[0]?.recorded_at instanceof Date, 'UUID/BYTEA/TIMESTAMPTZ round-trip failed');

    let roomId: string;
    let marker: string;
    let roomVersion: number;
    if (options.expectedRoomId) {
      roomId = options.expectedRoomId;
      const retained = await persistence.rooms.findById(roomId);
      check('retained-room', retained !== null, 'room was not retained after restart');
      const retainedMarker = retained?.gameSnapshot.marker;
      marker = typeof retainedMarker === 'string' ? retainedMarker : '';
      roomVersion = retained?.aggregateVersion ?? 0;
      check('retained-jsonb-marker', marker.startsWith('phase7-runtime-proof-'), 'retained JSONB marker is missing');
    } else {
      roomId = randomUUID();
      marker = `phase7-runtime-proof-${randomUUID()}`;
      const created = await persistence.rooms.create({
        id: roomId,
        code: `P7-${randomUUID().slice(0, 12)}`,
        status: 'LOBBY',
        snapshotSchemaVersion: 8,
        gameSnapshot: { marker, nested: { typed: true } },
      });
      roomVersion = created.aggregateVersion;
      const read = await persistence.rooms.findById(roomId);
      check('jsonb-room-roundtrip', read?.gameSnapshot.marker === marker, 'JSONB room snapshot did not round-trip');
    }
    checks['room-read-write'] = true;

    const casRoomId = randomUUID();
    const casRoom = await persistence.rooms.create({
      id: casRoomId,
      code: `CAS-${randomUUID().slice(0, 12)}`,
      status: 'LOBBY',
      snapshotSchemaVersion: 8,
      gameSnapshot: { marker: 'cas' },
    });
    await persistence.rooms.save({
      id: casRoomId,
      expectedVersion: casRoom.aggregateVersion,
      status: 'IN_PROGRESS',
      hostPlayerId: null,
      snapshotSchemaVersion: 8,
      gameSnapshot: { marker: 'cas-updated' },
      nextActionAt: null,
      lastActivityAt: new Date(),
      expiresAt: null,
    });
    let conflict = false;
    try {
      await persistence.rooms.save({
        id: casRoomId,
        expectedVersion: casRoom.aggregateVersion,
        status: 'IN_PROGRESS',
        hostPlayerId: null,
        snapshotSchemaVersion: 8,
        gameSnapshot: { marker: 'cas-stale' },
        nextActionAt: null,
        lastActivityAt: new Date(),
        expiresAt: null,
      });
    } catch (error) {
      conflict = error instanceof RoomVersionConflictError;
    }
    check('compare-and-swap-conflict', conflict, 'stale room write was accepted');
    await persistence.rooms.delete(casRoomId);

    const rollbackSessionId = randomUUID();
    try {
      await persistence.transaction(async ({ playerSessions }) => {
        await playerSessions.createPending({
          id: rollbackSessionId,
          tokenHash: randomBytes(32),
          requestedRoomCode: 'ROLLBACK',
          requestedName: 'Phase 7 proof',
          expiresAt: new Date(Date.now() + 60_000),
        });
        throw new Error('phase7 rollback');
      });
    } catch (error) {
      check('transaction-rollback', error instanceof Error && error.message === 'phase7 rollback', 'transaction did not reject');
    }
    check('rollback-no-row', await persistence.playerSessions.findById(rollbackSessionId) === null, 'rolled-back session remained');

    const sessionId = randomUUID();
    const tokenHash = randomBytes(32);
    const session = await persistence.playerSessions.createPending({
      id: sessionId,
      tokenHash,
      requestedRoomCode: 'SESSION',
      requestedName: 'Phase 7 proof',
      expiresAt: new Date(Date.now() - 60_000),
    });
    check('token-digest-only', !Object.prototype.hasOwnProperty.call(session, 'tokenHash'), 'raw token digest crossed the record boundary');
    check('token-digest-lookup', (await persistence.playerSessions.findByTokenHash(tokenHash))?.id === sessionId, 'digest lookup failed');
    check('session-expire', await persistence.playerSessions.expireDue(new Date(), 10) === 1, 'expired session was not transitioned');
    check('session-purge', await persistence.playerSessions.purgeTerminal(new Date(Date.now() + 1), 10) === 1, 'terminal session was not purged');

    const lockedSessionId = randomUUID();
    const lockedTokenHash = new Uint8Array(32).fill(19);
    await persistence.playerSessions.createPending({
      id: lockedSessionId,
      tokenHash: lockedTokenHash,
      requestedRoomCode: 'LOCKED',
      requestedName: 'Phase 7 proof',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await checkIndependentTransactions(pool, roomId, lockedSessionId, timeoutMs);
    checks['two-client-independent-begin'] = true;
    checks['for-update-skip-locked'] = true;

    await pool.query('DELETE FROM player_sessions WHERE id = $1', [lockedSessionId]);
    const retainedVersion = (await persistence.rooms.findById(roomId))?.aggregateVersion ?? roomVersion;
    return {
      pass: true,
      roomId,
      marker,
      aggregateVersion: retainedVersion,
      checks,
      database: {
        majorVersion,
        listenAddresses: serverRow.listen_addresses,
        port: Number(serverRow.port),
      },
    };
  } finally {
    await persistence.close();
  }
}
