import {
  assertTokenHash,
  normalizeRoomCode,
  RoomVersionConflictError,
  type ActivateSessionInput,
  type CreatePendingSessionInput,
  type CreateRoomInput,
  type CreateTradeOfferInput,
  type PersistenceStore,
  type PersistenceUnitOfWork,
  type PlayerSessionRecord,
  type PlayerSessionRepository,
  type RoomRecord,
  type RoomRepository,
  type SaveRoomInput,
  type TradeOfferRecord,
  type TradeOfferRepository,
  type TradeOfferStatus,
} from './types.js';

interface InMemoryState<TSnapshot extends object> {
  rooms: Map<string, RoomRecord<TSnapshot>>;
  sessions: Map<string, PlayerSessionRecord>;
  sessionIdsByTokenHash: Map<string, string>;
  offers: Map<string, TradeOfferRecord>;
}

function createEmptyState<TSnapshot extends object>(): InMemoryState<TSnapshot> {
  return {
    rooms: new Map(),
    sessions: new Map(),
    sessionIdsByTokenHash: new Map(),
    offers: new Map(),
  };
}

function clone<TValue>(value: TValue): TValue {
  return structuredClone(value);
}

function tokenHashKey(tokenHash: Uint8Array): string {
  assertTokenHash(tokenHash);
  return Buffer.from(tokenHash).toString('hex');
}

class InMemoryRoomRepository<TSnapshot extends object>
  implements RoomRepository<TSnapshot>
{
  constructor(private readonly getState: () => InMemoryState<TSnapshot>) {}

  findById(id: string): Promise<RoomRecord<TSnapshot> | null> {
    const room = this.getState().rooms.get(id);
    return Promise.resolve(room ? clone(room) : null);
  }

  findByCode(code: string): Promise<RoomRecord<TSnapshot> | null> {
    const normalizedCode = normalizeRoomCode(code);
    const room = [...this.getState().rooms.values()].find(
      (candidate) => candidate.code === normalizedCode,
    );
    return Promise.resolve(room ? clone(room) : null);
  }

  create(
    input: CreateRoomInput<TSnapshot>,
  ): Promise<RoomRecord<TSnapshot>> {
    const state = this.getState();
    const code = normalizeRoomCode(input.code);
    if (state.rooms.has(input.id)) {
      return Promise.reject(new Error(`Room ${input.id} already exists`));
    }
    if ([...state.rooms.values()].some((room) => room.code === code)) {
      return Promise.reject(new Error(`Room code ${code} already exists`));
    }

    const now = new Date();
    const room: RoomRecord<TSnapshot> = {
      id: input.id,
      code,
      status: input.status,
      hostPlayerId: input.hostPlayerId ?? null,
      aggregateVersion: 1,
      snapshotSchemaVersion: input.snapshotSchemaVersion,
      gameSnapshot: clone(input.gameSnapshot),
      nextActionAt: input.nextActionAt ?? null,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: input.lastActivityAt ?? now,
      expiresAt: input.expiresAt ?? null,
    };
    state.rooms.set(room.id, room);
    return Promise.resolve(clone(room));
  }

  save(input: SaveRoomInput<TSnapshot>): Promise<RoomRecord<TSnapshot>> {
    const state = this.getState();
    const current = state.rooms.get(input.id);
    if (!current || current.aggregateVersion !== input.expectedVersion) {
      return Promise.reject(
        new RoomVersionConflictError(input.id, input.expectedVersion),
      );
    }

    const saved: RoomRecord<TSnapshot> = {
      ...current,
      status: input.status,
      hostPlayerId: input.hostPlayerId,
      aggregateVersion: current.aggregateVersion + 1,
      snapshotSchemaVersion: input.snapshotSchemaVersion,
      gameSnapshot: clone(input.gameSnapshot),
      nextActionAt: input.nextActionAt,
      updatedAt: new Date(),
      lastActivityAt: input.lastActivityAt,
      expiresAt: input.expiresAt,
    };
    state.rooms.set(saved.id, saved);
    return Promise.resolve(clone(saved));
  }

  delete(id: string): Promise<boolean> {
    const state = this.getState();
    const deleted = state.rooms.delete(id);
    if (deleted) {
      const deletedSessionIds = new Set<string>();
      for (const [sessionId, session] of state.sessions) {
        if (session.roomId === id) {
          state.sessions.delete(sessionId);
          deletedSessionIds.add(sessionId);
        }
      }
      for (const [hash, sessionId] of state.sessionIdsByTokenHash) {
        if (deletedSessionIds.has(sessionId)) {
          state.sessionIdsByTokenHash.delete(hash);
        }
      }
      for (const [offerId, offer] of state.offers) {
        if (offer.roomId === id) state.offers.delete(offerId);
      }
    }
    return Promise.resolve(deleted);
  }

  listDue(now: Date, limit: number): Promise<RoomRecord<TSnapshot>[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      return Promise.reject(
        new Error('Room due-list limit must be a positive integer'),
      );
    }
    const rooms = [...this.getState().rooms.values()]
      .filter(
        (room) => room.nextActionAt !== null && room.nextActionAt <= now,
      )
      .sort((left, right) => {
        const byDate =
          left.nextActionAt!.getTime() - right.nextActionAt!.getTime();
        return byDate === 0 ? left.id.localeCompare(right.id) : byDate;
      })
      .slice(0, limit);
    return Promise.resolve(clone(rooms));
  }
}

class InMemoryPlayerSessionRepository<TSnapshot extends object>
  implements PlayerSessionRepository
{
  constructor(
    private readonly getState: () => InMemoryState<TSnapshot>,
  ) {}

  findById(id: string): Promise<PlayerSessionRecord | null> {
    const session = this.getState().sessions.get(id);
    return Promise.resolve(session ? clone(session) : null);
  }

  findByTokenHash(
    tokenHash: Uint8Array,
  ): Promise<PlayerSessionRecord | null> {
    const state = this.getState();
    const id = state.sessionIdsByTokenHash.get(tokenHashKey(tokenHash));
    const session = id ? state.sessions.get(id) : undefined;
    return Promise.resolve(session ? clone(session) : null);
  }

  createPending(
    input: CreatePendingSessionInput,
  ): Promise<PlayerSessionRecord> {
    const state = this.getState();
    const hashKey = tokenHashKey(input.tokenHash);
    if (state.sessions.has(input.id)) {
      return Promise.reject(new Error(`Session ${input.id} already exists`));
    }
    if (state.sessionIdsByTokenHash.has(hashKey)) {
      return Promise.reject(new Error('Reconnect token hash already exists'));
    }

    const session: PlayerSessionRecord = {
      id: input.id,
      status: 'PENDING',
      requestedRoomCode: normalizeRoomCode(input.requestedRoomCode),
      requestedName: input.requestedName,
      roomId: null,
      playerId: null,
      createdAt: new Date(),
      lastUsedAt: null,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    state.sessions.set(session.id, session);
    state.sessionIdsByTokenHash.set(hashKey, session.id);
    return Promise.resolve(clone(session));
  }

  activate(
    input: ActivateSessionInput,
  ): Promise<PlayerSessionRecord | null> {
    const state = this.getState();
    const current = state.sessions.get(input.sessionId);
    if (
      !current ||
      current.status !== 'PENDING' ||
      current.expiresAt === null ||
      current.expiresAt <= input.activatedAt
    ) {
      return Promise.resolve(null);
    }
    if (
      [...state.sessions.values()].some(
        (session) =>
          session.status === 'ACTIVE' &&
          session.roomId === input.roomId &&
          session.playerId === input.playerId,
      )
    ) {
      return Promise.reject(new Error('Player already has an active session'));
    }

    const activated: PlayerSessionRecord = {
      ...current,
      status: 'ACTIVE',
      requestedRoomCode: null,
      requestedName: null,
      roomId: input.roomId,
      playerId: input.playerId,
      lastUsedAt: input.activatedAt,
      expiresAt: null,
    };
    state.sessions.set(activated.id, activated);
    return Promise.resolve(clone(activated));
  }

  touch(id: string, usedAt: Date): Promise<boolean> {
    const state = this.getState();
    const current = state.sessions.get(id);
    if (!current || current.status !== 'ACTIVE') return Promise.resolve(false);
    state.sessions.set(id, { ...current, lastUsedAt: usedAt });
    return Promise.resolve(true);
  }

  revoke(id: string, revokedAt: Date): Promise<boolean> {
    const state = this.getState();
    const current = state.sessions.get(id);
    if (!current || !['PENDING', 'ACTIVE'].includes(current.status)) {
      return Promise.resolve(false);
    }
    state.sessions.set(id, {
      ...current,
      status: 'REVOKED',
      expiresAt: null,
      revokedAt,
    });
    return Promise.resolve(true);
  }

  revokeByPlayer(
    roomId: string,
    playerId: string,
    revokedAt: Date,
  ): Promise<boolean> {
    const state = this.getState();
    const session = [...state.sessions.values()].find(
      (candidate) =>
        candidate.status === 'ACTIVE' &&
        candidate.roomId === roomId &&
        candidate.playerId === playerId,
    );
    if (!session) return Promise.resolve(false);
    state.sessions.set(session.id, {
      ...session,
      status: 'REVOKED',
      expiresAt: null,
      revokedAt,
    });
    return Promise.resolve(true);
  }

  expireDue(now: Date, limit: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      return Promise.reject(
        new Error('Session expiry limit must be a positive integer'),
      );
    }
    const state = this.getState();
    const due = [...state.sessions.values()]
      .filter(
        (session) =>
          session.status === 'PENDING' &&
          session.expiresAt !== null &&
          session.expiresAt <= now,
      )
      .sort((left, right) => {
        const byDate = left.expiresAt!.getTime() - right.expiresAt!.getTime();
        return byDate === 0 ? left.id.localeCompare(right.id) : byDate;
      })
      .slice(0, limit);
    for (const session of due) {
      state.sessions.set(session.id, { ...session, status: 'EXPIRED' });
    }
    return Promise.resolve(due.length);
  }

  purgeTerminal(before: Date, limit: number): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      return Promise.reject(
        new Error('Session purge limit must be a positive integer'),
      );
    }
    const state = this.getState();
    const terminal = [...state.sessions.values()]
      .filter((session) => (
        (session.status === 'EXPIRED'
          && session.expiresAt !== null
          && session.expiresAt <= before)
        || (session.status === 'REVOKED'
          && session.revokedAt !== null
          && session.revokedAt <= before)
      ))
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, limit);
    for (const session of terminal) {
      state.sessions.delete(session.id);
      for (const [hash, sessionId] of state.sessionIdsByTokenHash) {
        if (sessionId === session.id) state.sessionIdsByTokenHash.delete(hash);
      }
    }
    return Promise.resolve(terminal.length);
  }
}

class InMemoryTradeOfferRepository<TSnapshot extends object>
  implements TradeOfferRepository
{
  constructor(
    private readonly getState: () => InMemoryState<TSnapshot>,
  ) {}

  findById(id: string): Promise<TradeOfferRecord | null> {
    const offer = this.getState().offers.get(id);
    return Promise.resolve(offer ? clone(offer) : null);
  }

  create(input: CreateTradeOfferInput): Promise<TradeOfferRecord> {
    if (input.proposerPlayerId === input.recipientPlayerId) {
      return Promise.reject(new Error('Trade offer players must be different'));
    }
    const state = this.getState();
    if (state.offers.has(input.id)) {
      return Promise.reject(new Error(`Trade offer ${input.id} already exists`));
    }
    if (!state.rooms.has(input.roomId)) {
      return Promise.reject(new Error(`Room ${input.roomId} does not exist`));
    }
    const now = new Date();
    if (input.expiresAt <= now) {
      return Promise.reject(new Error('Trade offer expiry must be in the future'));
    }
    const offer: TradeOfferRecord = {
      ...input,
      status: 'PENDING',
      createdAt: now,
      resolvedAt: null,
    };
    state.offers.set(offer.id, offer);
    return Promise.resolve(clone(offer));
  }

  listPendingForPlayer(
    roomId: string,
    playerId: string,
  ): Promise<TradeOfferRecord[]> {
    const now = new Date();
    const offers = [...this.getState().offers.values()]
      .filter(
        (offer) =>
          offer.roomId === roomId &&
          offer.status === 'PENDING' &&
          offer.expiresAt > now &&
          (offer.proposerPlayerId === playerId || offer.recipientPlayerId === playerId),
      )
      .sort((left, right) => {
        const byDate = left.createdAt.getTime() - right.createdAt.getTime();
        return byDate === 0 ? left.id.localeCompare(right.id) : byDate;
      });
    return Promise.resolve(clone(offers));
  }

  listPendingForRoom(roomId: string): Promise<TradeOfferRecord[]> {
    const now = new Date();
    const offers = [...this.getState().offers.values()]
      .filter((offer) => (
        offer.roomId === roomId
        && offer.status === 'PENDING'
        && offer.expiresAt > now
      ))
      .sort((left, right) => {
        const byDate = left.createdAt.getTime() - right.createdAt.getTime();
        return byDate === 0 ? left.id.localeCompare(right.id) : byDate;
      });
    return Promise.resolve(clone(offers));
  }

  listDue(now: Date, limit: number): Promise<TradeOfferRecord[]> {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      return Promise.reject(
        new Error('Trade offer due-list limit must be a positive integer'),
      );
    }
    const offers = [...this.getState().offers.values()]
      .filter((offer) => offer.status === 'PENDING' && offer.expiresAt <= now)
      .sort((left, right) => {
        const byDate = left.expiresAt.getTime() - right.expiresAt.getTime();
        return byDate === 0 ? left.id.localeCompare(right.id) : byDate;
      })
      .slice(0, limit);
    return Promise.resolve(clone(offers));
  }

  resolve(
    id: string,
    status: Exclude<TradeOfferStatus, 'PENDING'>,
    resolvedAt: Date,
  ): Promise<TradeOfferRecord | null> {
    const state = this.getState();
    const current = state.offers.get(id);
    if (!current || current.status !== 'PENDING') return Promise.resolve(null);
    const isExpiry = status === 'EXPIRED';
    if (
      (isExpiry && current.expiresAt > resolvedAt) ||
      (!isExpiry && current.expiresAt <= resolvedAt)
    ) {
      return Promise.resolve(null);
    }
    const resolved: TradeOfferRecord = {
      ...current,
      status,
      resolvedAt,
    };
    state.offers.set(id, resolved);
    return Promise.resolve(clone(resolved));
  }
}

function createUnitOfWork<TSnapshot extends object>(
  getState: () => InMemoryState<TSnapshot>,
): PersistenceUnitOfWork<TSnapshot> {
  return {
    rooms: new InMemoryRoomRepository<TSnapshot>(getState),
    playerSessions: new InMemoryPlayerSessionRepository(getState),
    tradeOffers: new InMemoryTradeOfferRepository(getState),
  };
}

/** Test adapter. Production must use PostgresPersistenceStore. */
export class InMemoryPersistenceStore<TSnapshot extends object>
  implements PersistenceStore<TSnapshot>
{
  readonly rooms: RoomRepository<TSnapshot>;
  readonly playerSessions: PlayerSessionRepository;
  readonly tradeOffers: TradeOfferRepository;

  private state = createEmptyState<TSnapshot>();
  private transactionTail: Promise<void> = Promise.resolve();

  constructor() {
    const repositories = createUnitOfWork(() => this.state);
    this.rooms = repositories.rooms;
    this.playerSessions = repositories.playerSessions;
    this.tradeOffers = repositories.tradeOffers;
  }

  async transaction<TResult>(
    operation: (
      transaction: PersistenceUnitOfWork<TSnapshot>,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    let releaseTransaction!: () => void;
    const previousTransaction = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });

    await previousTransaction;
    const draft = clone(this.state);
    try {
      const result = await operation(createUnitOfWork(() => draft));
      this.state = draft;
      return result;
    } finally {
      releaseTransaction();
    }
  }

  healthcheck(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
