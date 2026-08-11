import { randomUUID } from 'node:crypto';
import type { OfferResult, PlayerId } from '@monopoly/shared';
import {
  finalizeAuction,
  nextTurn,
  startAuction,
} from '../game';
import { assertSupportedRoomSnapshot } from '../rooms';
import { broadcastRoom, privatePlayerRoomName } from '../socket/broadcast';
import { commitRoomCommand } from '../socket/roomCommands';
import type { AppServer } from '../socket/types';
import { projectPrivateOffer } from './privateOffers';
import type { AppRuntime } from './runtime';

const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 100;

class StaleDeadlineError extends Error {}

export async function recoverRoomIfDue(
  io: AppServer,
  runtime: AppRuntime,
  roomId: string,
  now = new Date(),
): Promise<void> {
  const candidate = await runtime.persistence.rooms.findById(roomId);
  if (!candidate) return;
  assertSupportedRoomSnapshot(candidate);
  if (!candidate.nextActionAt || candidate.nextActionAt > now) return;

  const expectedRoomExpiry = candidate.expiresAt && candidate.expiresAt <= now
    ? candidate.expiresAt.getTime()
    : undefined;
  const candidateAuction = candidate.gameSnapshot.gameState.boardState.auction;
  const expectedAuction = candidateAuction
    && Date.parse(candidateAuction.endsAt) <= now.getTime()
    ? { auctionId: candidateAuction.auctionId, endsAt: candidateAuction.endsAt }
    : undefined;
  const candidateRecovery = candidate.gameSnapshot.gameState.boardState.turnRecovery;
  const expectedRecovery = candidateRecovery
    && Date.parse(candidateRecovery.deadlineAt) <= now.getTime()
    ? { ...candidateRecovery }
    : undefined;

  try {
    const committed = await commitRoomCommand(runtime, roomId, (context) => {
      const { state, room } = context;
      let changed = false;

      if (
        expectedRoomExpiry !== undefined
        && room.expiresAt?.getTime() === expectedRoomExpiry
        && room.expiresAt <= now
      ) {
        const hasConnectedPlayer = Object.entries(room.gameSnapshot.members)
          .some(([playerId, member]) => (
            member.membershipStatus !== 'LEFT'
            && runtime.connections.isConnected(playerId)
          ));
        if (!hasConnectedPlayer) {
          context.deleteRoom();
          return true;
        }
        changed = true;
      }

      const auction = state.boardState.auction;
      if (
        expectedAuction
        && auction?.auctionId === expectedAuction.auctionId
        && auction.endsAt === expectedAuction.endsAt
        && Date.parse(auction.endsAt) <= now.getTime()
      ) {
        changed = finalizeAuction(state, expectedAuction.auctionId) || changed;
      }

      const recovery = state.boardState.turnRecovery;
      if (
        expectedRecovery
        && recovery?.turnNumber === expectedRecovery.turnNumber
        && recovery.playerId === expectedRecovery.playerId
        && recovery.deadlineAt === expectedRecovery.deadlineAt
        && Date.parse(recovery.deadlineAt) <= now.getTime()
      ) {
        const isCurrentTurn = recovery.turnNumber === state.boardState.turnNumber
          && recovery.playerId === state.boardState.currentPlayer.id;
        state.boardState.turnRecovery = null;
        changed = true;
        if (!isCurrentTurn || state.boardState.winner || state.boardState.auction) {
          return changed;
        }

        const player = state.players[recovery.playerId];
        if (
          state.turnInfo.canBuyProp
          && player
          && !state.boardState.ownedProps[player.currentTile]
        ) {
          startAuction(state, player.currentTile, {
            auctionId: randomUUID(),
            now: now.getTime(),
          });
        } else {
          // This deliberately does not change jailRounds. It only skips the turn.
          nextTurn(state);
        }
      }

      if (!changed) throw new StaleDeadlineError();
      return changed;
    }, now);

    if (committed.result && committed.room) {
      broadcastRoom(io, runtime, committed.room);
    }
  } catch (error) {
    if (error instanceof StaleDeadlineError) return;
    throw error;
  }
}

export async function reconcileTurnPresence(
  io: AppServer,
  runtime: AppRuntime,
  roomId: string,
  reconnectingPlayerId?: PlayerId,
  now = new Date(),
): Promise<void> {
  await recoverRoomIfDue(io, runtime, roomId, now);
  const current = await runtime.persistence.rooms.findById(roomId);
  if (!current || current.status !== 'IN_PROGRESS') return;
  assertSupportedRoomSnapshot(current);
  const board = current.gameSnapshot.gameState.boardState;
  const currentPlayerId = board.currentPlayer.id;
  if (!currentPlayerId || board.auction || board.winner) return;

  const shouldClear = reconnectingPlayerId === currentPlayerId
    && board.turnRecovery?.playerId === currentPlayerId
    && board.turnRecovery.turnNumber === board.turnNumber
    && Date.parse(board.turnRecovery.deadlineAt) > now.getTime();
  const shouldArm = !board.turnRecovery
    && !runtime.connections.isConnected(currentPlayerId)
    && reconnectingPlayerId !== currentPlayerId;
  if (!shouldClear && !shouldArm) return;

  const committed = await commitRoomCommand(runtime, roomId, ({ state }) => {
    const latestBoard = state.boardState;
    if (
      shouldClear
      && latestBoard.currentPlayer.id === reconnectingPlayerId
      && latestBoard.turnRecovery?.playerId === reconnectingPlayerId
      && latestBoard.turnRecovery.turnNumber === latestBoard.turnNumber
      && Date.parse(latestBoard.turnRecovery.deadlineAt) > now.getTime()
    ) {
      latestBoard.turnRecovery = null;
      return;
    }
    if (
      shouldArm
      && !latestBoard.turnRecovery
      && !latestBoard.auction
      && latestBoard.currentPlayer.id
      && !runtime.connections.isConnected(latestBoard.currentPlayer.id)
    ) {
      latestBoard.turnRecovery = {
        playerId: latestBoard.currentPlayer.id,
        turnNumber: latestBoard.turnNumber,
        deadlineAt: new Date(now.getTime() + runtime.timing.reconnectGraceMs).toISOString(),
      };
    }
  }, now);
  if (committed.room) broadcastRoom(io, runtime, committed.room);
}

export async function armDisconnectedCurrentPlayer(
  io: AppServer,
  runtime: AppRuntime,
  roomId: string,
  disconnectedPlayerId: PlayerId,
  now = new Date(),
): Promise<void> {
  if (runtime.flags.shuttingDown || runtime.connections.isConnected(disconnectedPlayerId)) return;
  const room = await runtime.persistence.rooms.findById(roomId);
  if (room) assertSupportedRoomSnapshot(room);
  const board = room?.gameSnapshot.gameState.boardState;
  if (
    !room
    || room.status !== 'IN_PROGRESS'
    || board?.currentPlayer.id !== disconnectedPlayerId
    || board.auction
    || board.turnRecovery
    || board.winner
  ) return;

  const committed = await commitRoomCommand(runtime, roomId, ({ state }) => {
    if (
      runtime.connections.isConnected(disconnectedPlayerId)
      || state.boardState.currentPlayer.id !== disconnectedPlayerId
      || state.boardState.auction
      || state.boardState.turnRecovery
      || state.boardState.winner
    ) return;
    state.boardState.turnRecovery = {
      playerId: disconnectedPlayerId,
      turnNumber: state.boardState.turnNumber,
      deadlineAt: new Date(now.getTime() + runtime.timing.reconnectGraceMs).toISOString(),
    };
  }, now);
  if (committed.room) broadcastRoom(io, runtime, committed.room);
}

export class DeadlineScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;

  private running = false;

  constructor(
    private readonly io: AppServer,
    private readonly runtime: AppRuntime,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async runOnce(now = new Date()): Promise<void> {
    await this.runtime.persistence.playerSessions.expireDue(now, BATCH_SIZE);
    await this.runtime.persistence.playerSessions.purgeTerminal(
      new Date(now.getTime() - this.runtime.timing.terminalSessionRetentionMs),
      BATCH_SIZE,
    );
    const [rooms, offers] = await Promise.all([
      this.runtime.persistence.rooms.listDue(now, BATCH_SIZE),
      this.runtime.persistence.tradeOffers.listDue(now, BATCH_SIZE),
    ]);

    const roomResults = await Promise.allSettled(
      rooms.map((room) => recoverRoomIfDue(this.io, this.runtime, room.id, now)),
    );
    roomResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Room deadline recovery failed for ${rooms[index]?.id}`, result.reason);
      }
    });

    const offerResults = await Promise.allSettled(offers.map(async (offer) => {
      const resolved = await this.runtime.persistence.tradeOffers.resolve(
        offer.id,
        'EXPIRED',
        now,
      );
      if (!resolved) return;
      const room = await this.runtime.persistence.rooms.findById(resolved.roomId);
      if (!room) return;
      const projected = projectPrivateOffer(resolved, room);
      const result: OfferResult = {
        offerId: projected.offerId,
        status: 'EXPIRED',
        tileID: projected.tileID,
        tileName: projected.tileName,
        price: projected.price,
        ownerName: projected.ownerName,
        resolvedAt: projected.resolvedAt ?? now.toISOString(),
      };
      this.io.to(privatePlayerRoomName(resolved.buyerPlayerId)).emit('offer expired', result);
      this.io.to(privatePlayerRoomName(resolved.ownerPlayerId)).emit('offer expired', result);
    }));
    offerResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Offer deadline recovery failed for ${offers[index]?.id}`, result.reason);
      }
    });
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch((error: unknown) => console.error('Deadline scheduler failed', error))
        .finally(() => this.scheduleNext());
    }, POLL_INTERVAL_MS);
  }
}
