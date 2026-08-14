import type { OfferResult, PlayerId } from '@monopoly/shared';
import {
  activeDebtClaim,
  bankruptActiveDebtor,
  completeTurnResolution,
  nextTurn,
  resumePaymentContinuation,
  settleAffordableClaims,
  sellPropertyToBankForPayment,
} from '../game';
import { assertSupportedRoomSnapshot } from '../rooms';
import { cancelPendingOffersForAssets } from './offerInvalidation';
import { projectPrivateOffer } from './privateOffers';
import { broadcastRoom, privatePlayerRoomName } from '../socket/broadcast';
import { commitRoomCommand } from '../socket/roomCommands';
import type { AppServer } from '../socket/types';
import type { TradeOfferRecord } from '../persistence/types';
import type { AppRuntime } from './runtime';

const POLL_INTERVAL_MS = 1_000;
const BATCH_SIZE = 100;

class StaleDeadlineError extends Error {}

interface RecoveryResult {
  changed: boolean;
  cancelledOffers: TradeOfferRecord[];
}

const emitCancelledOffers = (
  io: AppServer,
  room: Parameters<typeof projectPrivateOffer>[1],
  records: TradeOfferRecord[],
  now: Date,
): void => {
  for (const record of records) {
    const offer = projectPrivateOffer(record, room);
    const result: OfferResult = {
      offerId: offer.offerId,
      status: 'CANCELLED',
      proposerPlayerId: offer.proposerPlayerId,
      recipientPlayerId: offer.recipientPlayerId,
      proposerName: offer.proposerName,
      recipientName: offer.recipientName,
      offered: offer.offered,
      requested: offer.requested,
      resolvedAt: offer.resolvedAt ?? now.toISOString(),
    };
    io.to(privatePlayerRoomName(offer.proposerPlayerId)).emit('offer cancelled', result);
    io.to(privatePlayerRoomName(offer.recipientPlayerId)).emit('offer cancelled', result);
  }
};

const recoverPaymentShortfall = async (
  context: Parameters<Parameters<typeof commitRoomCommand>[2]>[0],
  expected: {
    operationId: string;
    activeClaimIndex: number;
    claimId: string;
    deadlineAt: string;
  },
  now: Date,
  runtime: AppRuntime,
): Promise<{ changed: boolean; cancelledOffers: TradeOfferRecord[] }> => {
  const { state, transaction } = context;
  const queue = state.boardState.paymentQueue;
  const claim = queue?.orderedClaims[queue.activeClaimIndex];
  if (
    !queue
    || !claim
    || queue.operationId !== expected.operationId
    || queue.activeClaimIndex !== expected.activeClaimIndex
    || claim.claimId !== expected.claimId
    || queue.actionDeadlineAt !== expected.deadlineAt
    || Date.parse(queue.actionDeadlineAt) > now.getTime()
  ) return { changed: false, cancelledOffers: [] };

  const options = {
    now: now.getTime(),
    paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
  };
  const debtorId = claim.debtorPlayerId;
  const debtor = state.players[debtorId];
  if (!debtor) return { changed: false, cancelledOffers: [] };

  const cancelledOffers: TradeOfferRecord[] = [];
  let changed = false;
  let continuation = settleAffordableClaims(state, options);
  if (continuation) {
    resumePaymentContinuation(state, continuation, options);
    return { changed: true, cancelledOffers };
  }

  const ownedTileIds = (): number[] => Object.entries(state.boardState.ownedProps)
    .filter(([, property]) => property.id === debtorId)
    .map(([tileID]) => Number(tileID))
    .sort((left, right) => left - right);

  for (const tileID of ownedTileIds()) {
    const active = activeDebtClaim(state);
    const currentQueue = state.boardState.paymentQueue;
    if (!active || !currentQueue || active.debtorPlayerId !== debtorId) break;
    const soldContinuation = sellPropertyToBankForPayment(
      state,
      debtorId,
      currentQueue.operationId,
      active.claimId,
      tileID,
      options,
    );
    const cancelled = await cancelPendingOffersForAssets(
      transaction.tradeOffers,
      context.original.id,
      null,
      [tileID],
      [],
      now,
    );
    cancelledOffers.push(...cancelled);
    changed = true;
    if (soldContinuation) {
      resumePaymentContinuation(state, soldContinuation, options);
      return { changed, cancelledOffers };
    }
    continuation = settleAffordableClaims(state, options);
    if (continuation) {
      resumePaymentContinuation(state, continuation, options);
      return { changed, cancelledOffers };
    }
  }

  const remaining = activeDebtClaim(state);
  if (remaining?.debtorPlayerId === debtorId && state.boardState.paymentQueue) {
    // No property remains and the cash already available has been applied by
    // settleAffordableClaims. Mark this debtor's claims terminal, then let
    // the ordered queue continue to any other debtor.
    const continuationAfterBankruptcy = bankruptActiveDebtor(
      state,
      debtorId,
      'BANKRUPT',
      options,
    );
    const pendingOffers = await transaction.tradeOffers.listPendingForPlayer(
      context.original.id,
      debtorId,
    );
    const cancelled = await Promise.all(
      pendingOffers.map((offer) => transaction.tradeOffers.resolve(
        offer.id,
        'CANCELLED',
        now,
      )),
    );
    cancelledOffers.push(...cancelled.filter((offer): offer is TradeOfferRecord => offer !== null));
    if (continuationAfterBankruptcy) {
      resumePaymentContinuation(state, continuationAfterBankruptcy, options);
    }
    changed = true;
  }
  return { changed, cancelledOffers };
};

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
  const candidateRecovery = candidate.gameSnapshot.gameState.boardState.turnRecovery;
  const expectedRecovery = candidateRecovery
    && Date.parse(candidateRecovery.deadlineAt) <= now.getTime()
    ? { ...candidateRecovery }
    : undefined;
  const candidateQueue = candidate.gameSnapshot.gameState.boardState.paymentQueue;
  const candidateClaim = candidateQueue?.orderedClaims[candidateQueue.activeClaimIndex];
  const expectedPayment = candidateQueue && candidateClaim
    && Date.parse(candidateQueue.actionDeadlineAt) <= now.getTime()
    ? {
        operationId: candidateQueue.operationId,
        activeClaimIndex: candidateQueue.activeClaimIndex,
        claimId: candidateClaim.claimId,
        deadlineAt: candidateQueue.actionDeadlineAt,
      }
    : undefined;
  const candidateProposal = candidate.gameSnapshot.gameState.privateState.forcedSaleProposal;
  const expectedProposal = candidateProposal
    && Date.parse(candidateProposal.expiresAt) <= now.getTime()
    ? { proposalId: candidateProposal.proposalId, expiresAt: candidateProposal.expiresAt }
    : undefined;

  try {
    const committed = await commitRoomCommand(runtime, roomId, async (context): Promise<RecoveryResult> => {
      const { state, room } = context;
      let changed = false;
      const cancelledOffers: TradeOfferRecord[] = [];

      if (
        expectedRoomExpiry !== undefined
        && room.expiresAt?.getTime() === expectedRoomExpiry
        && room.expiresAt <= now
      ) {
        const hasConnectedPlayer = Object.entries(room.gameSnapshot.members).some(([playerId, member]) => (
          member.membershipStatus !== 'LEFT' && runtime.connections.isConnected(playerId)
        ));
        if (!hasConnectedPlayer) {
          context.deleteRoom();
          return { changed: true, cancelledOffers };
        }
        changed = true;
      }

      const proposal = state.privateState.forcedSaleProposal;
      if (
        expectedProposal
        && proposal?.proposalId === expectedProposal.proposalId
        && proposal.expiresAt === expectedProposal.expiresAt
        && Date.parse(proposal.expiresAt) <= now.getTime()
      ) {
        state.privateState.forcedSaleProposal = null;
        changed = true;
      }

      if (expectedPayment) {
        const paymentResult = await recoverPaymentShortfall(context, expectedPayment, now, runtime);
        changed ||= paymentResult.changed;
        cancelledOffers.push(...paymentResult.cancelledOffers);
      }

      const recovery = state.boardState.turnRecovery;
      if (
        expectedRecovery
        && recovery?.turnNumber === expectedRecovery.turnNumber
        && recovery.playerId === expectedRecovery.playerId
        && recovery.deadlineAt === expectedRecovery.deadlineAt
        && (recovery.pendingOperationId ?? null) === (expectedRecovery.pendingOperationId ?? null)
        && Date.parse(recovery.deadlineAt) <= now.getTime()
      ) {
        const isCurrentTurn = recovery.turnNumber === state.boardState.turnNumber
          && recovery.playerId === state.boardState.currentPlayer.id;
        state.boardState.turnRecovery = null;
        changed = true;
        if (isCurrentTurn && !state.boardState.winner && !state.boardState.paymentQueue) {
          const player = state.players[recovery.playerId];
          if (state.turnInfo.pendingPropertyDecision && player) {
            const continuation = state.turnInfo.pendingPropertyDecision.continuation;
            state.turnInfo = {};
            completeTurnResolution(state, continuation);
          } else if (state.turnInfo.pendingDevelopmentDecision && player) {
            const continuation = state.turnInfo.pendingDevelopmentDecision.continuation;
            state.turnInfo = {};
            completeTurnResolution(state, continuation);
          } else {
            nextTurn(state);
          }
        }
      }

      if (!changed) throw new StaleDeadlineError();
      return { changed, cancelledOffers };
    }, now);

    if (committed.result.changed && committed.room) {
      emitCancelledOffers(io, committed.room, committed.result.cancelledOffers, now);
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
  if (!currentPlayerId || board.paymentQueue || current.gameSnapshot.gameState.privateState.forcedSaleProposal || board.winner) return;

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
      && !latestBoard.paymentQueue
      && latestBoard.currentPlayer.id
      && !runtime.connections.isConnected(latestBoard.currentPlayer.id)
    ) {
      latestBoard.turnRecovery = {
        playerId: latestBoard.currentPlayer.id,
        turnNumber: latestBoard.turnNumber,
        deadlineAt: new Date(now.getTime() + runtime.timing.reconnectGraceMs).toISOString(),
        pendingOperationId: state.turnInfo.pendingPropertyDecision?.operationId
          ?? state.turnInfo.pendingDevelopmentDecision?.operationId
          ?? null,
      };
    }
  }, now);
  if (committed.room) broadcastRoom(io, runtime, committed.room);
}

export async function armDisconnectedCurrentPlayer(
  io: AppServer,
  runtime: AppRuntime,
  roomId: string,
  disconnectedPlayerId: string,
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
    || board.paymentQueue
    || room.gameSnapshot.gameState.privateState.forcedSaleProposal
    || board.turnRecovery
    || board.winner
  ) return;

  const committed = await commitRoomCommand(runtime, roomId, ({ state }) => {
    if (
      runtime.connections.isConnected(disconnectedPlayerId)
      || state.boardState.currentPlayer.id !== disconnectedPlayerId
      || state.boardState.paymentQueue
      || state.boardState.turnRecovery
      || state.boardState.winner
    ) return;
    state.boardState.turnRecovery = {
      playerId: disconnectedPlayerId,
      turnNumber: state.boardState.turnNumber,
      deadlineAt: new Date(now.getTime() + runtime.timing.reconnectGraceMs).toISOString(),
      pendingOperationId: state.turnInfo.pendingPropertyDecision?.operationId
        ?? state.turnInfo.pendingDevelopmentDecision?.operationId
        ?? null,
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
      const resolved = await this.runtime.persistence.tradeOffers.resolve(offer.id, 'EXPIRED', now);
      if (!resolved) return;
      const room = await this.runtime.persistence.rooms.findById(resolved.roomId);
      if (!room) return;
      const projected = projectPrivateOffer(resolved, room);
      const result: OfferResult = {
        offerId: projected.offerId,
        status: 'EXPIRED',
        proposerPlayerId: projected.proposerPlayerId,
        recipientPlayerId: projected.recipientPlayerId,
        proposerName: projected.proposerName,
        recipientName: projected.recipientName,
        offered: projected.offered,
        requested: projected.requested,
        resolvedAt: projected.resolvedAt ?? now.toISOString(),
      };
      this.io.to(privatePlayerRoomName(resolved.proposerPlayerId)).emit('offer expired', result);
      this.io.to(privatePlayerRoomName(resolved.recipientPlayerId)).emit('offer expired', result);
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
