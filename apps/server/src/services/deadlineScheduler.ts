import type { OfferResult, PlayerId } from '@monopoly/shared';
import {
  activeDebtClaim,
  completeTurnResolution,
  dismissPendingCard,
  drawPendingCard,
  nextTurn,
  progressPaymentQueue,
  resumePaymentContinuation,
  sellablePropertyIds,
  sellPropertyToBankForPayment,
} from '../game';
import { assertSupportedRoomSnapshot } from '../rooms';
import { cancelPendingOffersForAssets, cancelPendingOffersForPlayer } from './offerInvalidation';
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
  forcedSalePlayers: PlayerId[];
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
): Promise<{ changed: boolean; cancelledOffers: TradeOfferRecord[]; forcedSalePlayers: PlayerId[] }> => {
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
  ) return { changed: false, cancelledOffers: [], forcedSalePlayers: [] };

  const options = {
    now: now.getTime(),
    paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
  };
  const debtorId = claim.debtorPlayerId;
  const debtor = state.players[debtorId];
  if (!debtor) return { changed: false, cancelledOffers: [], forcedSalePlayers: [] };

  const cancelledOffers: TradeOfferRecord[] = [];
  let changed = false;
  const cancelDebtorOffers = async (): Promise<void> => {
    if (state.players[debtorId]) return;
    cancelledOffers.push(...await cancelPendingOffersForPlayer(
      transaction.tradeOffers,
      context.original.id,
      debtorId,
      now,
    ));
  };
  let progress = progressPaymentQueue(state, options);
  changed ||= progress.changed;
  if (progress.status === 'COMPLETED') {
    if (progress.continuation) resumePaymentContinuation(state, progress.continuation, options);
    await cancelDebtorOffers();
    return { changed, cancelledOffers, forcedSalePlayers: [] };
  }

  for (const tileID of sellablePropertyIds(state, debtorId)) {
    const active = activeDebtClaim(state);
    const currentQueue = state.boardState.paymentQueue;
    if (!active || !currentQueue || active.debtorPlayerId !== debtorId) break;
    const sale = sellPropertyToBankForPayment(
      state,
      debtorId,
      currentQueue.operationId,
      active.claimId,
      tileID,
      { ...options, allowExpired: true },
    );
    if (!sale.ok) continue;
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
    progress = progressPaymentQueue(state, options);
    changed ||= progress.changed;
    if (progress.status === 'COMPLETED') {
      if (progress.continuation) resumePaymentContinuation(state, progress.continuation, options);
      await cancelDebtorOffers();
      return { changed, cancelledOffers, forcedSalePlayers: [] };
    }
  }
  progress = progressPaymentQueue(state, options);
  changed ||= progress.changed;
  if (progress.status === 'COMPLETED') {
    if (progress.continuation) resumePaymentContinuation(state, progress.continuation, options);
    await cancelDebtorOffers();
  }
  return { changed, cancelledOffers, forcedSalePlayers: [] };
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
  const candidateCard = candidate.gameSnapshot.gameState.turnInfo.pendingCardInteraction;
  const expectedCard = candidateCard && Date.parse(candidateCard.deadlineAt) <= now.getTime()
    ? {
        operationId: candidateCard.operationId,
        playerId: candidateCard.playerId,
        stage: candidateCard.stage,
        deadlineAt: candidateCard.deadlineAt,
      }
    : undefined;

  try {
    const committed = await commitRoomCommand(runtime, roomId, async (context): Promise<RecoveryResult> => {
      const { state, room } = context;
      let changed = false;
      const cancelledOffers: TradeOfferRecord[] = [];
      const forcedSalePlayers: PlayerId[] = [];

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
          return { changed: true, cancelledOffers, forcedSalePlayers };
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
        forcedSalePlayers.push(proposal.sellerPlayerId, proposal.buyerPlayerId);
        state.privateState.forcedSaleProposal = null;
        changed = true;
      }

      if (expectedPayment) {
        const paymentResult = await recoverPaymentShortfall(context, expectedPayment, now, runtime);
        changed ||= paymentResult.changed;
        cancelledOffers.push(...paymentResult.cancelledOffers);
        forcedSalePlayers.push(...paymentResult.forcedSalePlayers);
      }

      const card = state.turnInfo.pendingCardInteraction;
      if (
        expectedCard
        && card?.operationId === expectedCard.operationId
        && card.playerId === expectedCard.playerId
        && card.stage === expectedCard.stage
        && card.deadlineAt === expectedCard.deadlineAt
        && Date.parse(card.deadlineAt) <= now.getTime()
      ) {
        const options = {
          now: now.getTime(),
          paymentShortfallActionTimeoutMs: runtime.timing.paymentShortfallActionTimeoutMs,
          cardAwaitingDrawTimeoutMs: runtime.timing.cardAwaitingDrawTimeoutMs,
          cardRevealedTimeoutMs: runtime.timing.cardRevealedTimeoutMs,
        };
        if (card.stage === 'AWAITING_DRAW') {
          drawPendingCard(state, card.playerId, card.operationId, options);
        } else {
          dismissPendingCard(state, card.playerId, card.operationId, options);
        }
        state.boardState.turnRecovery = null;
        changed = true;
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
          } else if (!state.turnInfo.pendingCardInteraction) {
            nextTurn(state);
          }
        }
      }

      if (!changed) throw new StaleDeadlineError();
      return { changed, cancelledOffers, forcedSalePlayers };
    }, now);

    if (committed.result.changed && committed.room) {
      emitCancelledOffers(io, committed.room, committed.result.cancelledOffers, now);
      for (const playerId of new Set(committed.result.forcedSalePlayers)) {
        io.to(privatePlayerRoomName(playerId)).emit('forced sale proposal', null);
      }
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
  if (
    !currentPlayerId
    || board.paymentQueue
    || current.gameSnapshot.gameState.turnInfo.pendingCardInteraction
    || current.gameSnapshot.gameState.privateState.forcedSaleProposal
    || board.winner
  ) return;

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
      && !state.turnInfo.pendingCardInteraction
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
    || room.gameSnapshot.gameState.turnInfo.pendingCardInteraction
    || room.gameSnapshot.gameState.privateState.forcedSaleProposal
    || board.turnRecovery
    || board.winner
  ) return;

  const committed = await commitRoomCommand(runtime, roomId, ({ state }) => {
    if (
      runtime.connections.isConnected(disconnectedPlayerId)
      || state.boardState.currentPlayer.id !== disconnectedPlayerId
      || state.boardState.paymentQueue
      || state.turnInfo.pendingCardInteraction
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
