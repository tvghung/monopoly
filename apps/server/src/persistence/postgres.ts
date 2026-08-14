import {
  Pool,
  type PoolClient,
  type QueryResultRow,
} from 'pg';
import type { TradeBundle } from '@monopoly/shared';

import type { DatabaseConfig } from '../config.js';
import {
  assertTokenHash,
  normalizeRoomCode,
  RoomVersionConflictError,
  type ActivateSessionInput,
  type CreatePendingSessionInput,
  type CreateRoomInput,
  type CreateTradeOfferInput,
  type FindRoomOptions,
  type PersistenceStore,
  type PersistenceUnitOfWork,
  type PlayerSessionRecord,
  type PlayerSessionRepository,
  type PlayerSessionStatus,
  type RoomRecord,
  type RoomRepository,
  type RoomStatus,
  type SaveRoomInput,
  type TradeOfferRecord,
  type TradeOfferRepository,
  type TradeOfferStatus,
} from './types.js';

type DatabaseClient = Pool | PoolClient;

interface RoomRow extends QueryResultRow {
  id: string;
  code: string;
  status: RoomStatus;
  host_player_id: string | null;
  aggregate_version: string | number;
  snapshot_schema_version: number;
  game_snapshot: unknown;
  next_action_at: Date | null;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
  expires_at: Date | null;
}

interface PlayerSessionRow extends QueryResultRow {
  id: string;
  status: PlayerSessionStatus;
  requested_room_code: string | null;
  requested_name: string | null;
  room_id: string | null;
  player_id: string | null;
  created_at: Date;
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
}

interface TradeOfferRow extends QueryResultRow {
  id: string;
  room_id: string;
  proposer_player_id: string;
  recipient_player_id: string;
  offered_bundle: TradeBundle;
  requested_bundle: TradeBundle;
  status: TradeOfferStatus;
  created_at: Date;
  expires_at: Date;
  resolved_at: Date | null;
}

const ROOM_COLUMNS = `
  id, code, status, host_player_id, aggregate_version,
  snapshot_schema_version, game_snapshot, next_action_at,
  created_at, updated_at, last_activity_at, expires_at
`;

const SESSION_COLUMNS = `
  id, status, requested_room_code, requested_name, room_id, player_id,
  created_at, last_used_at, expires_at, revoked_at
`;

const OFFER_COLUMNS = `
  id, room_id, proposer_player_id, recipient_player_id,
  offered_bundle, requested_bundle, status,
  created_at, expires_at, resolved_at
`;

function parseAggregateVersion(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid room aggregate version: ${String(value)}`);
  }
  return parsed;
}

function mapRoom<TSnapshot extends object>(row: RoomRow): RoomRecord<TSnapshot> {
  if (
    typeof row.game_snapshot !== 'object' ||
    row.game_snapshot === null ||
    Array.isArray(row.game_snapshot)
  ) {
    throw new Error(`Room ${row.id} has an invalid game snapshot`);
  }

  return {
    id: row.id,
    code: row.code,
    status: row.status,
    hostPlayerId: row.host_player_id,
    aggregateVersion: parseAggregateVersion(row.aggregate_version),
    snapshotSchemaVersion: row.snapshot_schema_version,
    gameSnapshot: row.game_snapshot as TSnapshot,
    nextActionAt: row.next_action_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastActivityAt: row.last_activity_at,
    expiresAt: row.expires_at,
  };
}

function mapSession(row: PlayerSessionRow): PlayerSessionRecord {
  return {
    id: row.id,
    status: row.status,
    requestedRoomCode: row.requested_room_code,
    requestedName: row.requested_name,
    roomId: row.room_id,
    playerId: row.player_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function mapOffer(row: TradeOfferRow): TradeOfferRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    proposerPlayerId: row.proposer_player_id,
    recipientPlayerId: row.recipient_player_id,
    offered: row.offered_bundle,
    requested: row.requested_bundle,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
  };
}

class PostgresRoomRepository<TSnapshot extends object>
  implements RoomRepository<TSnapshot>
{
  constructor(private readonly database: DatabaseClient) {}

  async findById(
    id: string,
    options: FindRoomOptions = {},
  ): Promise<RoomRecord<TSnapshot> | null> {
    const result = await this.database.query<RoomRow>(
      `SELECT ${ROOM_COLUMNS} FROM rooms WHERE id = $1${
        options.forUpdate ? ' FOR UPDATE' : ''
      }`,
      [id],
    );
    return result.rows[0] ? mapRoom<TSnapshot>(result.rows[0]) : null;
  }

  async findByCode(
    code: string,
    options: FindRoomOptions = {},
  ): Promise<RoomRecord<TSnapshot> | null> {
    const result = await this.database.query<RoomRow>(
      `SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = $1${
        options.forUpdate ? ' FOR UPDATE' : ''
      }`,
      [normalizeRoomCode(code)],
    );
    return result.rows[0] ? mapRoom<TSnapshot>(result.rows[0]) : null;
  }

  async create(
    input: CreateRoomInput<TSnapshot>,
  ): Promise<RoomRecord<TSnapshot>> {
    const result = await this.database.query<RoomRow>(
      `
        INSERT INTO rooms (
          id, code, status, host_player_id, snapshot_schema_version,
          game_snapshot, next_action_at, last_activity_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
        RETURNING ${ROOM_COLUMNS}
      `,
      [
        input.id,
        normalizeRoomCode(input.code),
        input.status,
        input.hostPlayerId ?? null,
        input.snapshotSchemaVersion,
        JSON.stringify(input.gameSnapshot),
        input.nextActionAt ?? null,
        input.lastActivityAt ?? new Date(),
        input.expiresAt ?? null,
      ],
    );
    return mapRoom<TSnapshot>(result.rows[0]);
  }

  async save(
    input: SaveRoomInput<TSnapshot>,
  ): Promise<RoomRecord<TSnapshot>> {
    const result = await this.database.query<RoomRow>(
      `
        UPDATE rooms
        SET status = $3,
            host_player_id = $4,
            snapshot_schema_version = $5,
            game_snapshot = $6::jsonb,
            next_action_at = $7,
            last_activity_at = $8,
            expires_at = $9,
            aggregate_version = aggregate_version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND aggregate_version = $2
        RETURNING ${ROOM_COLUMNS}
      `,
      [
        input.id,
        input.expectedVersion,
        input.status,
        input.hostPlayerId,
        input.snapshotSchemaVersion,
        JSON.stringify(input.gameSnapshot),
        input.nextActionAt,
        input.lastActivityAt,
        input.expiresAt,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new RoomVersionConflictError(input.id, input.expectedVersion);
    }
    return mapRoom<TSnapshot>(row);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.database.query(
      'DELETE FROM rooms WHERE id = $1',
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listDue(now: Date, limit: number): Promise<RoomRecord<TSnapshot>[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('Room due-list limit must be a positive integer');
    }
    const result = await this.database.query<RoomRow>(
      `
        SELECT ${ROOM_COLUMNS}
        FROM rooms
        WHERE next_action_at IS NOT NULL AND next_action_at <= $1
        ORDER BY next_action_at, id
        LIMIT $2
      `,
      [now, limit],
    );
    return result.rows.map((row) => mapRoom<TSnapshot>(row));
  }
}

class PostgresPlayerSessionRepository implements PlayerSessionRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findById(id: string): Promise<PlayerSessionRecord | null> {
    const result = await this.database.query<PlayerSessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM player_sessions WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async findByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<PlayerSessionRecord | null> {
    assertTokenHash(tokenHash);
    const result = await this.database.query<PlayerSessionRow>(
      `SELECT ${SESSION_COLUMNS} FROM player_sessions WHERE token_hash = $1`,
      [Buffer.from(tokenHash)],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async createPending(
    input: CreatePendingSessionInput,
  ): Promise<PlayerSessionRecord> {
    assertTokenHash(input.tokenHash);
    const result = await this.database.query<PlayerSessionRow>(
      `
        INSERT INTO player_sessions (
          id, status, token_hash, requested_room_code, requested_name, expires_at
        ) VALUES ($1, 'PENDING', $2, $3, $4, $5)
        RETURNING ${SESSION_COLUMNS}
      `,
      [
        input.id,
        Buffer.from(input.tokenHash),
        normalizeRoomCode(input.requestedRoomCode),
        input.requestedName,
        input.expiresAt,
      ],
    );
    return mapSession(result.rows[0]);
  }

  async activate(
    input: ActivateSessionInput,
  ): Promise<PlayerSessionRecord | null> {
    const result = await this.database.query<PlayerSessionRow>(
      `
        UPDATE player_sessions
        SET status = 'ACTIVE',
            requested_room_code = NULL,
            requested_name = NULL,
            room_id = $2,
            player_id = $3,
            last_used_at = $4,
            expires_at = NULL
        WHERE id = $1
          AND status = 'PENDING'
          AND expires_at > $4
        RETURNING ${SESSION_COLUMNS}
      `,
      [input.sessionId, input.roomId, input.playerId, input.activatedAt],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  }

  async touch(id: string, usedAt: Date): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE player_sessions
        SET last_used_at = $2
        WHERE id = $1 AND status = 'ACTIVE'
      `,
      [id, usedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revoke(id: string, revokedAt: Date): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE player_sessions
        SET status = 'REVOKED', revoked_at = $2, expires_at = NULL
        WHERE id = $1 AND status IN ('PENDING', 'ACTIVE')
      `,
      [id, revokedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async revokeByPlayer(
    roomId: string,
    playerId: string,
    revokedAt: Date,
  ): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE player_sessions
        SET status = 'REVOKED', revoked_at = $3, expires_at = NULL
        WHERE room_id = $1 AND player_id = $2 AND status = 'ACTIVE'
      `,
      [roomId, playerId, revokedAt],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async expireDue(now: Date, limit: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('Session expiry limit must be a positive integer');
    }
    const result = await this.database.query(
      `
        WITH due AS (
          SELECT id
          FROM player_sessions
          WHERE status = 'PENDING' AND expires_at <= $1
          ORDER BY expires_at, id
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        UPDATE player_sessions AS session
        SET status = 'EXPIRED'
        FROM due
        WHERE session.id = due.id
      `,
      [now, limit],
    );
    return result.rowCount ?? 0;
  }

  async purgeTerminal(before: Date, limit: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('Session purge limit must be a positive integer');
    }
    const result = await this.database.query(
      `
        DELETE FROM player_sessions
        WHERE id IN (
          SELECT id
          FROM player_sessions
          WHERE (status = 'EXPIRED' AND expires_at <= $1)
             OR (status = 'REVOKED' AND revoked_at <= $1)
          ORDER BY id
          LIMIT $2
        )
      `,
      [before, limit],
    );
    return result.rowCount ?? 0;
  }
}

class PostgresTradeOfferRepository implements TradeOfferRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findById(id: string): Promise<TradeOfferRecord | null> {
    const result = await this.database.query<TradeOfferRow>(
      `SELECT ${OFFER_COLUMNS} FROM trade_offers WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? mapOffer(result.rows[0]) : null;
  }

  async create(input: CreateTradeOfferInput): Promise<TradeOfferRecord> {
    const result = await this.database.query<TradeOfferRow>(
      `
        INSERT INTO trade_offers (
          id, room_id, proposer_player_id, recipient_player_id,
          offered_bundle, requested_bundle, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
        RETURNING ${OFFER_COLUMNS}
      `,
      [
        input.id,
        input.roomId,
        input.proposerPlayerId,
        input.recipientPlayerId,
        JSON.stringify(input.offered),
        JSON.stringify(input.requested),
        input.expiresAt,
      ],
    );
    return mapOffer(result.rows[0]);
  }

  async listPendingForPlayer(
    roomId: string,
    playerId: string,
  ): Promise<TradeOfferRecord[]> {
    const result = await this.database.query<TradeOfferRow>(
      `
        SELECT ${OFFER_COLUMNS}
        FROM trade_offers
        WHERE room_id = $1
          AND (proposer_player_id = $2 OR recipient_player_id = $2)
          AND status = 'PENDING'
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at, id
      `,
      [roomId, playerId],
    );
    return result.rows.map(mapOffer);
  }

  async listPendingForRoom(roomId: string): Promise<TradeOfferRecord[]> {
    const result = await this.database.query<TradeOfferRow>(
      `
        SELECT ${OFFER_COLUMNS}
        FROM trade_offers
        WHERE room_id = $1
          AND status = 'PENDING'
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY created_at, id
      `,
      [roomId],
    );
    return result.rows.map(mapOffer);
  }

  async listDue(now: Date, limit: number): Promise<TradeOfferRecord[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('Trade offer due-list limit must be a positive integer');
    }
    const result = await this.database.query<TradeOfferRow>(
      `
        SELECT ${OFFER_COLUMNS}
        FROM trade_offers
        WHERE status = 'PENDING' AND expires_at <= $1
        ORDER BY expires_at, id
        LIMIT $2
      `,
      [now, limit],
    );
    return result.rows.map(mapOffer);
  }

  async resolve(
    id: string,
    status: Exclude<TradeOfferStatus, 'PENDING'>,
    resolvedAt: Date,
  ): Promise<TradeOfferRecord | null> {
    const result = await this.database.query<TradeOfferRow>(
      `
        UPDATE trade_offers
        SET status = $2, resolved_at = $3
        WHERE id = $1
          AND status = 'PENDING'
          AND (
            ($2 = 'EXPIRED' AND expires_at <= $3)
            OR ($2 <> 'EXPIRED' AND expires_at > $3)
          )
        RETURNING ${OFFER_COLUMNS}
      `,
      [id, status, resolvedAt],
    );
    return result.rows[0] ? mapOffer(result.rows[0]) : null;
  }
}

function createUnitOfWork<TSnapshot extends object>(
  database: DatabaseClient,
): PersistenceUnitOfWork<TSnapshot> {
  return {
    rooms: new PostgresRoomRepository<TSnapshot>(database),
    playerSessions: new PostgresPlayerSessionRepository(database),
    tradeOffers: new PostgresTradeOfferRepository(database),
  };
}

export class PostgresPersistenceStore<TSnapshot extends object>
  implements PersistenceStore<TSnapshot>
{
  readonly rooms: RoomRepository<TSnapshot>;
  readonly playerSessions: PlayerSessionRepository;
  readonly tradeOffers: TradeOfferRepository;

  constructor(private readonly pool: Pool) {
    const repositories = createUnitOfWork<TSnapshot>(pool);
    this.rooms = repositories.rooms;
    this.playerSessions = repositories.playerSessions;
    this.tradeOffers = repositories.tradeOffers;
  }

  async transaction<TResult>(
    operation: (
      transaction: PersistenceUnitOfWork<TSnapshot>,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(createUnitOfWork<TSnapshot>(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async healthcheck(): Promise<void> {
    const result = await this.pool.query<{ migration_applied: boolean }>(`
      WITH required_schema AS (
        SELECT
          room.id,
          room.status,
          room.host_player_id,
          room.aggregate_version,
          room.snapshot_schema_version,
          room.game_snapshot,
          room.next_action_at,
          session.token_hash,
          session.room_id,
          session.player_id,
          offer.proposer_player_id,
          offer.recipient_player_id,
          offer.offered_bundle,
          offer.requested_bundle,
          offer.expires_at
        FROM rooms AS room
        CROSS JOIN player_sessions AS session
        CROSS JOIN trade_offers AS offer
        LIMIT 0
      )
        SELECT EXISTS (
        SELECT 1
        FROM schema_migrations
        WHERE version = '005_remove_mortgage_open_market.sql'
      ) AS migration_applied
      FROM (SELECT 1) AS probe
      LEFT JOIN required_schema ON FALSE
    `);
    if (!result.rows[0]?.migration_applied) {
      throw new Error('Required database migration is not applied');
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createPostgresPersistence<TSnapshot extends object>(
  config: DatabaseConfig,
): PostgresPersistenceStore<TSnapshot> {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections,
    ssl: config.ssl
      ? { rejectUnauthorized: config.rejectUnauthorized }
      : undefined,
  });
  return new PostgresPersistenceStore<TSnapshot>(pool);
}
