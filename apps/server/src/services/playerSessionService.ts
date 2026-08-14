import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PlayerSessionRecord, RoomRecord } from '../persistence/types';
import type { PersistenceStore, PersistenceUnitOfWork } from '../persistence';
import type { PersistenceTimingConfig } from '../config';
import {
  MAX_PLAYERS,
  ROOM_SNAPSHOT_SCHEMA_VERSION,
  activePlayerIds,
  assertSupportedRoomSnapshot,
  calculateNextActionAt,
  createRoomSnapshot,
  nextAvailableColor,
  normalizeRoomId,
  type RoomSnapshot,
} from '../rooms';
import { sanitizeName, sendToLog } from '../game';
import { CommandError } from '../socket/errors';

export interface PendingAdmissionResult {
  kind: 'PENDING';
  token: string;
  expiresAt: Date;
}

export interface SpectatorAdmissionResult {
  kind: 'SPECTATOR';
  room: RoomRecord<RoomSnapshot>;
}

export type BeginAdmissionResult = PendingAdmissionResult | SpectatorAdmissionResult;

export interface ResumePlayerResult {
  session: PlayerSessionRecord;
  room: RoomRecord<RoomSnapshot>;
  playerId: string;
  activated: boolean;
}

const tokenHash = (token: string): Uint8Array => (
  createHash('sha256').update(token).digest()
);

const addMilliseconds = (date: Date, milliseconds: number): Date => (
  new Date(date.getTime() + milliseconds)
);

const minDate = (...dates: Array<Date | null>): Date | null => {
  const present = dates.filter((date): date is Date => date !== null);
  return present.length === 0
    ? null
    : new Date(Math.min(...present.map((date) => date.getTime())));
};

export class PlayerSessionService {
  constructor(
    private readonly persistence: PersistenceStore<RoomSnapshot>,
    private readonly timing: PersistenceTimingConfig,
  ) {}

  async beginAdmission(
    rawName: string,
    rawRoomCode: string,
    now = new Date(),
  ): Promise<BeginAdmissionResult> {
    const roomCode = normalizeRoomId(rawRoomCode);
    const name = sanitizeName(rawName) || 'Người chơi';
    const token = randomBytes(32).toString('base64url');
    const expiresAt = addMilliseconds(now, this.timing.pendingSessionTtlMs);

    return this.persistence.transaction(async (transaction) => {
      const room = await transaction.rooms.findByCode(roomCode, { forUpdate: true });
      if (room) {
        assertSupportedRoomSnapshot(room);
        if (room.status !== 'LOBBY') return { kind: 'SPECTATOR', room };
        if (activePlayerIds(room.gameSnapshot).length >= MAX_PLAYERS) {
          throw new CommandError('ROOM_FULL', 'The lobby already has seven active players.');
        }
      }

      await transaction.playerSessions.createPending({
        id: randomUUID(),
        tokenHash: tokenHash(token),
        requestedRoomCode: roomCode,
        requestedName: name,
        expiresAt,
      });
      return { kind: 'PENDING', token, expiresAt };
    });
  }

  async resume(token: string, now = new Date()): Promise<ResumePlayerResult> {
    // Make an already-due token terminal before looking it up. This write is
    // deliberately outside the activation transaction so an error response
    // cannot roll the expiry back.
    await this.persistence.playerSessions.expireDue(now, 100);
    const current = await this.persistence.playerSessions.findByTokenHash(tokenHash(token));
    if (!current) throw new CommandError('SESSION_INVALID', 'Reconnect token is invalid.');
    if (current.status === 'REVOKED') {
      throw new CommandError('SESSION_REVOKED', 'This player session was revoked.');
    }
    if (current.status === 'EXPIRED') {
      throw new CommandError('SESSION_EXPIRED', 'This player admission expired.');
    }

    if (current.status === 'ACTIVE') return this.resumeActive(token, now);
    return this.activatePending(token, now);
  }

  private async resumeActive(token: string, now: Date): Promise<ResumePlayerResult> {
    return this.persistence.transaction(async (transaction) => {
      const session = await transaction.playerSessions.findByTokenHash(tokenHash(token));
      if (!session || session.status !== 'ACTIVE' || !session.roomId || !session.playerId) {
        throw new CommandError('SESSION_INVALID', 'Reconnect token is no longer active.');
      }
      const room = await transaction.rooms.findById(session.roomId, { forUpdate: true });
      if (!room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
      assertSupportedRoomSnapshot(room);
      const member = room.gameSnapshot.members[session.playerId];
      if (!member || member.membershipStatus === 'LEFT') {
        throw new CommandError('SESSION_REVOKED', 'This player has left the room.');
      }

      await transaction.playerSessions.touch(session.id, now);
      const expiresAt = this.roomExpiry(room.status, now);
      const savedRoom = await transaction.rooms.save({
        id: room.id,
        expectedVersion: room.aggregateVersion,
        status: room.status,
        hostPlayerId: room.hostPlayerId,
        snapshotSchemaVersion: room.snapshotSchemaVersion,
        gameSnapshot: room.gameSnapshot,
        nextActionAt: minDate(calculateNextActionAt(room.gameSnapshot), expiresAt),
        lastActivityAt: now,
        expiresAt,
      });
      return { session: { ...session, lastUsedAt: now }, room: savedRoom, playerId: session.playerId, activated: false };
    });
  }

  private async activatePending(token: string, now: Date): Promise<ResumePlayerResult> {
    try {
      return await this.activatePendingOnce(token, now);
    } catch (error) {
      // Two activations can both observe a missing room code. PostgreSQL's
      // unique room-code constraint picks the creator; retry then joins it.
      if (this.isUniqueViolation(error)) return this.activatePendingOnce(token, now);
      throw error;
    }
  }

  private async activatePendingOnce(token: string, now: Date): Promise<ResumePlayerResult> {
    return this.persistence.transaction(async (transaction) => {
      const session = await transaction.playerSessions.findByTokenHash(tokenHash(token));
      if (!session) throw new CommandError('SESSION_INVALID', 'Reconnect token is invalid.');
      if (session.status === 'ACTIVE' && session.roomId && session.playerId) {
        const room = await transaction.rooms.findById(session.roomId, { forUpdate: true });
        if (!room) throw new CommandError('ROOM_GONE', 'The room no longer exists.');
        assertSupportedRoomSnapshot(room);
        return { session, room, playerId: session.playerId, activated: false };
      }
      if (
        session.status !== 'PENDING'
        || !session.requestedRoomCode
        || !session.requestedName
        || !session.expiresAt
        || session.expiresAt <= now
      ) {
        throw new CommandError('SESSION_EXPIRED', 'This player admission expired.');
      }

      const playerId = randomUUID();
      const existing = await transaction.rooms.findByCode(session.requestedRoomCode, {
        forUpdate: true,
      });
      const room = existing
        ? await this.addPlayerToExistingRoom(transaction, existing, playerId, session.requestedName, now)
        : await this.createRoomWithFirstPlayer(
          transaction,
          session.requestedRoomCode,
          playerId,
          session.requestedName,
          now,
        );

      const activated = await transaction.playerSessions.activate({
        sessionId: session.id,
        roomId: room.id,
        playerId,
        activatedAt: now,
      });
      if (!activated) {
        throw new CommandError('CONFLICT', 'This admission was activated elsewhere.', true);
      }
      return { session: activated, room, playerId, activated: true };
    });
  }

  private async createRoomWithFirstPlayer(
    transaction: PersistenceUnitOfWork<RoomSnapshot>,
    code: string,
    playerId: string,
    name: string,
    now: Date,
  ): Promise<RoomRecord<RoomSnapshot>> {
    const roomId = randomUUID();
    const snapshot = createRoomSnapshot();
    this.addSeat(snapshot, playerId, name);
    const expiresAt = this.roomExpiry('LOBBY', now);
    return transaction.rooms.create({
      id: roomId,
      code,
      status: 'LOBBY',
      hostPlayerId: playerId,
      snapshotSchemaVersion: ROOM_SNAPSHOT_SCHEMA_VERSION,
      gameSnapshot: snapshot,
      nextActionAt: expiresAt,
      lastActivityAt: now,
      expiresAt,
    });
  }

  private async addPlayerToExistingRoom(
    transaction: PersistenceUnitOfWork<RoomSnapshot>,
    room: RoomRecord<RoomSnapshot>,
    playerId: string,
    name: string,
    now: Date,
  ): Promise<RoomRecord<RoomSnapshot>> {
    assertSupportedRoomSnapshot(room);
    if (room.status !== 'LOBBY') {
      throw new CommandError('GAME_ALREADY_STARTED', 'The game has already started.');
    }
    const snapshot = structuredClone(room.gameSnapshot);
    if (activePlayerIds(snapshot).length >= MAX_PLAYERS) {
      throw new CommandError('ROOM_FULL', 'The lobby already has seven active players.');
    }
    this.addSeat(snapshot, playerId, name);
    const expiresAt = this.roomExpiry('LOBBY', now);
    return transaction.rooms.save({
      id: room.id,
      expectedVersion: room.aggregateVersion,
      status: room.status,
      hostPlayerId: room.hostPlayerId ?? playerId,
      snapshotSchemaVersion: room.snapshotSchemaVersion,
      gameSnapshot: snapshot,
      nextActionAt: minDate(calculateNextActionAt(snapshot), expiresAt),
      lastActivityAt: now,
      expiresAt,
    });
  }

  private addSeat(snapshot: RoomSnapshot, playerId: string, name: string): void {
    const color = nextAvailableColor(snapshot);
    if (!color) throw new CommandError('ROOM_FULL', 'No player color is available.');
    snapshot.members[playerId] = {
      joinOrder: snapshot.nextJoinOrder,
      ready: false,
      membershipStatus: 'ACTIVE',
    };
    snapshot.nextJoinOrder += 1;
    snapshot.gameState.players[playerId] = {
      name,
      currentTile: 0,
      color,
      accountBalance: 1500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    };
    snapshot.gameState.boardState.players = activePlayerIds(snapshot);
    sendToLog(snapshot.gameState, `${name} đã tham gia phòng.`);
  }

  private roomExpiry(status: RoomRecord['status'], now: Date): Date {
    const retention = status === 'LOBBY'
      ? this.timing.lobbyRetentionMs
      : status === 'IN_PROGRESS'
        ? this.timing.inProgressRetentionMs
        : this.timing.finishedRetentionMs;
    return addMilliseconds(now, retention);
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505');
  }
}
