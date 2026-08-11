export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';

export type PlayerSessionStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'REVOKED'
  | 'EXPIRED';

export type TradeOfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface RoomRecord<TSnapshot extends object = Record<string, unknown>> {
  id: string;
  code: string;
  status: RoomStatus;
  hostPlayerId: string | null;
  aggregateVersion: number;
  snapshotSchemaVersion: number;
  gameSnapshot: TSnapshot;
  nextActionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date;
  expiresAt: Date | null;
}

export interface CreateRoomInput<TSnapshot extends object> {
  id: string;
  code: string;
  status: RoomStatus;
  hostPlayerId?: string | null;
  snapshotSchemaVersion: number;
  gameSnapshot: TSnapshot;
  nextActionAt?: Date | null;
  lastActivityAt?: Date;
  expiresAt?: Date | null;
}

export interface SaveRoomInput<TSnapshot extends object> {
  id: string;
  expectedVersion: number;
  status: RoomStatus;
  hostPlayerId: string | null;
  snapshotSchemaVersion: number;
  gameSnapshot: TSnapshot;
  nextActionAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date | null;
}

export interface PlayerSessionRecord {
  id: string;
  status: PlayerSessionStatus;
  requestedRoomCode: string | null;
  requestedName: string | null;
  roomId: string | null;
  playerId: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface CreatePendingSessionInput {
  id: string;
  /** SHA-256 digest of the reconnect token. Raw tokens must never cross this boundary. */
  tokenHash: Uint8Array;
  requestedRoomCode: string;
  requestedName: string;
  expiresAt: Date;
}

export interface ActivateSessionInput {
  sessionId: string;
  roomId: string;
  playerId: string;
  activatedAt: Date;
}

export interface TradeOfferRecord {
  id: string;
  roomId: string;
  buyerPlayerId: string;
  ownerPlayerId: string;
  tileId: number;
  price: number;
  status: TradeOfferStatus;
  createdAt: Date;
  expiresAt: Date;
  resolvedAt: Date | null;
}

export interface CreateTradeOfferInput {
  id: string;
  roomId: string;
  buyerPlayerId: string;
  ownerPlayerId: string;
  tileId: number;
  price: number;
  expiresAt: Date;
}

export interface FindRoomOptions {
  /** Locks the selected row until the surrounding transaction completes. */
  forUpdate?: boolean;
}

export interface RoomRepository<TSnapshot extends object> {
  findById(
    id: string,
    options?: FindRoomOptions,
  ): Promise<RoomRecord<TSnapshot> | null>;
  findByCode(
    code: string,
    options?: FindRoomOptions,
  ): Promise<RoomRecord<TSnapshot> | null>;
  create(input: CreateRoomInput<TSnapshot>): Promise<RoomRecord<TSnapshot>>;
  save(input: SaveRoomInput<TSnapshot>): Promise<RoomRecord<TSnapshot>>;
  delete(id: string): Promise<boolean>;
  listDue(now: Date, limit: number): Promise<RoomRecord<TSnapshot>[]>;
}

export interface PlayerSessionRepository {
  findById(id: string): Promise<PlayerSessionRecord | null>;
  findByTokenHash(tokenHash: Uint8Array): Promise<PlayerSessionRecord | null>;
  createPending(
    input: CreatePendingSessionInput,
  ): Promise<PlayerSessionRecord>;
  activate(input: ActivateSessionInput): Promise<PlayerSessionRecord | null>;
  touch(id: string, usedAt: Date): Promise<boolean>;
  revoke(id: string, revokedAt: Date): Promise<boolean>;
  revokeByPlayer(
    roomId: string,
    playerId: string,
    revokedAt: Date,
  ): Promise<boolean>;
  expireDue(now: Date, limit: number): Promise<number>;
  purgeTerminal(before: Date, limit: number): Promise<number>;
}

export interface TradeOfferRepository {
  findById(id: string): Promise<TradeOfferRecord | null>;
  create(input: CreateTradeOfferInput): Promise<TradeOfferRecord>;
  listPendingForPlayer(
    roomId: string,
    playerId: string,
  ): Promise<TradeOfferRecord[]>;
  listDue(now: Date, limit: number): Promise<TradeOfferRecord[]>;
  resolve(
    id: string,
    status: Exclude<TradeOfferStatus, 'PENDING'>,
    resolvedAt: Date,
  ): Promise<TradeOfferRecord | null>;
}

export interface PersistenceUnitOfWork<TSnapshot extends object> {
  readonly rooms: RoomRepository<TSnapshot>;
  readonly playerSessions: PlayerSessionRepository;
  readonly tradeOffers: TradeOfferRepository;
}

export interface PersistenceStore<TSnapshot extends object>
  extends PersistenceUnitOfWork<TSnapshot> {
  transaction<TResult>(
    operation: (
      transaction: PersistenceUnitOfWork<TSnapshot>,
    ) => Promise<TResult>,
  ): Promise<TResult>;
  healthcheck(): Promise<void>;
  close(): Promise<void>;
}

export class RoomVersionConflictError extends Error {
  constructor(
    readonly roomId: string,
    readonly expectedVersion: number,
  ) {
    super(
      `Room ${roomId} was not at expected version ${String(expectedVersion)}`,
    );
    this.name = 'RoomVersionConflictError';
  }
}

export class RoomNotFoundError extends Error {
  constructor(readonly roomId: string) {
    super(`Room ${roomId} does not exist`);
    this.name = 'RoomNotFoundError';
  }
}

export function normalizeRoomCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (normalized.length === 0 || normalized.length > 64) {
    throw new Error('Room code must contain between 1 and 64 characters');
  }
  return normalized;
}

export function assertTokenHash(tokenHash: Uint8Array): void {
  if (tokenHash.byteLength !== 32) {
    throw new Error('Reconnect token hash must be a 32-byte SHA-256 digest');
  }
}
