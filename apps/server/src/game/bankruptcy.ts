import { randomUUID } from 'node:crypto';
import {
  gameCardsById,
  type DebtClaim,
  type GameState,
  type PendingTurnContinuation,
  type PlayerId,
} from '@monopoly/shared';
import {
  activeDebtClaim,
  DEFAULT_DEBT_ACTION_TIMEOUT_MS,
  settleAffordableClaims,
  type QueuePaymentOptions,
} from './payment';
import { liquidateBuildings } from './property';
import { removePlayerFromGame, checkWinner } from './turn';
import { mortgageTransferInterest, transferProperty } from './transfer';

const ownedTileIds = (state: GameState, playerId: PlayerId): number[] => (
  Object.keys(state.boardState.ownedProps)
    .map(Number)
    .filter((tileID) => state.boardState.ownedProps[tileID]?.id === playerId)
    .sort((a, b) => a - b)
);

const returnHeldCardsToDeck = (state: GameState, playerId: PlayerId): void => {
  const player = state.players[playerId];
  if (!player) return;
  for (const cardId of player.heldJailFreeCardIds) {
    const deck = gameCardsById[cardId]?.sourceDeck;
    if (deck && !state.privateState.decks[deck].drawPile.includes(cardId)) {
      state.privateState.decks[deck].drawPile.push(cardId);
    }
  }
  player.heldJailFreeCardIds = [];
};

const closeClaimsForEliminatedDebtor = (state: GameState, debtorPlayerId: PlayerId): void => {
  const queue = state.boardState.paymentQueue;
  if (!queue) return;
  for (let index = queue.activeClaimIndex; index < queue.orderedClaims.length; index += 1) {
    const claim = queue.orderedClaims[index];
    if (claim.debtorPlayerId !== debtorPlayerId) continue;
    claim.status = 'BANKRUPT';
    claim.remainingAmount = 0;
  }
  while (
    queue.activeClaimIndex < queue.orderedClaims.length
    && queue.orderedClaims[queue.activeClaimIndex].status !== 'PENDING'
  ) {
    queue.activeClaimIndex += 1;
  }
};

const mortgageInterestClaims = (
  creditorPlayerId: PlayerId,
  tileIds: number[],
): DebtClaim[] => tileIds
  .map((tileID): DebtClaim | null => {
    const amount = mortgageTransferInterest(tileID);
    if (amount <= 0) return null;
    return {
      claimId: randomUUID(),
      debtorPlayerId: creditorPlayerId,
      creditor: 'BANK',
      amount,
      remainingAmount: amount,
      source: { kind: 'MORTGAGE_INTEREST', tileID },
      status: 'PENDING',
    };
  })
  .filter((claim): claim is DebtClaim => claim !== null);

const armNextDebtDeadline = (
  state: GameState,
  options: Pick<QueuePaymentOptions, 'now' | 'debtActionTimeoutMs'>,
): void => {
  const queue = state.boardState.paymentQueue;
  if (!queue || !activeDebtClaim(state)) return;
  queue.actionDeadlineAt = new Date(
    (options.now ?? Date.now())
    + (options.debtActionTimeoutMs ?? DEFAULT_DEBT_ACTION_TIMEOUT_MS),
  ).toISOString();
};

const rebaseContinuationAfterElimination = (
  state: GameState,
  eliminatedPlayerId: PlayerId,
): void => {
  const successor = state.boardState.currentPlayer.id;
  if (!successor || !state.players[successor]) return;
  const replacement: PendingTurnContinuation = {
    playerId: successor,
    turnNumber: state.boardState.turnNumber,
    rolledDoubles: false,
    resume: { kind: 'NO_TURN_CHANGE' },
  };
  const queue = state.boardState.paymentQueue;
  if (queue?.continuation.playerId === eliminatedPlayerId) {
    queue.continuation = replacement;
  }
  const auction = state.boardState.auction;
  if (auction?.continuation?.playerId === eliminatedPlayerId) {
    auction.continuation = replacement;
  }
  const bankQueue = state.boardState.bankPropertyAuctionQueue;
  if (bankQueue?.continuation.playerId === eliminatedPlayerId) {
    bankQueue.continuation = replacement;
  }
};

const enqueueBankPropertyAuctions = (
  state: GameState,
  tileIds: number[],
  continuation: PendingTurnContinuation,
): void => {
  const current = state.boardState.bankPropertyAuctionQueue;
  if (!current) {
    state.boardState.bankPropertyAuctionQueue = {
      operationId: randomUUID(),
      orderedRemainingTileIds: [...tileIds].sort((left, right) => left - right),
      currentTileId: null,
      currentAuctionId: null,
      continuation,
    };
    return;
  }

  // Explicit leaves can happen while an earlier Bank queue is running. Keep
  // the live auction identity and merge only not-yet-auctioned tiles so neither
  // operation is lost or replayed.
  const queued = new Set(current.orderedRemainingTileIds);
  for (const tileID of tileIds) {
    if (tileID !== current.currentTileId) queued.add(tileID);
  }
  current.orderedRemainingTileIds = [...queued].sort((left, right) => left - right);
};

const transferBankruptAssetsToPlayer = (
  state: GameState,
  debtorPlayerId: PlayerId,
  creditorPlayerId: PlayerId,
): DebtClaim[] => {
  const debtor = state.players[debtorPlayerId];
  const creditor = state.players[creditorPlayerId];
  if (!debtor || !creditor) return [];
  liquidateBuildings(state, debtorPlayerId);
  creditor.accountBalance += debtor.accountBalance;
  debtor.accountBalance = 0;
  const mortgagedTiles: number[] = [];
  for (const tileID of ownedTileIds(state, debtorPlayerId)) {
    if (state.boardState.ownedProps[tileID]?.mortgaged) mortgagedTiles.push(tileID);
    transferProperty(state, tileID, debtorPlayerId, creditorPlayerId, 'BANKRUPTCY_TO_PLAYER');
  }
  creditor.heldJailFreeCardIds.push(...debtor.heldJailFreeCardIds);
  debtor.heldJailFreeCardIds = [];
  return mortgageInterestClaims(creditorPlayerId, mortgagedTiles);
};

export interface BankruptcyResult {
  changed: boolean;
  continuation: PendingTurnContinuation | null;
  bankAuctionQueued: boolean;
}

/** Declare bankruptcy against the exact active compulsory claim. */
export const declareActiveDebtBankruptcy = (
  state: GameState,
  debtorPlayerId: PlayerId,
  options: Pick<QueuePaymentOptions, 'now' | 'debtActionTimeoutMs'> = {},
): BankruptcyResult => {
  const queue = state.boardState.paymentQueue;
  const claim = activeDebtClaim(state);
  if (!queue || !claim || claim.debtorPlayerId !== debtorPlayerId || !state.players[debtorPlayerId]) {
    return { changed: false, continuation: null, bankAuctionQueued: false };
  }

  if (claim.creditor === 'PLAYER' && claim.creditorPlayerId && state.players[claim.creditorPlayerId]) {
    const interestClaims = transferBankruptAssetsToPlayer(
      state,
      debtorPlayerId,
      claim.creditorPlayerId,
    );
    closeClaimsForEliminatedDebtor(state, debtorPlayerId);
    if (interestClaims.length > 0) {
      queue.orderedClaims.splice(queue.activeClaimIndex, 0, ...interestClaims);
    }
    armNextDebtDeadline(state, options);
    removePlayerFromGame(state, debtorPlayerId, 'BANKRUPT', { deferWinner: true });
    rebaseContinuationAfterElimination(state, debtorPlayerId);
    const continuation = settleAffordableClaims(state, options);
    if (!state.boardState.paymentQueue && !state.boardState.bankPropertyAuctionQueue) {
      checkWinner(state);
    }
    return { changed: true, continuation, bankAuctionQueued: false };
  }

  liquidateBuildings(state, debtorPlayerId);
  state.players[debtorPlayerId].accountBalance = 0;
  returnHeldCardsToDeck(state, debtorPlayerId);
  const tileIds = ownedTileIds(state, debtorPlayerId);
  for (const tileID of tileIds) transferProperty(state, tileID, debtorPlayerId, null, 'RETURN_TO_BANK');
  closeClaimsForEliminatedDebtor(state, debtorPlayerId);
  armNextDebtDeadline(state, options);
  removePlayerFromGame(state, debtorPlayerId, 'BANKRUPT', { deferWinner: true });
  rebaseContinuationAfterElimination(state, debtorPlayerId);
  const queueContinuation = queue.continuation;
  if (queue.activeClaimIndex >= queue.orderedClaims.length) {
    state.boardState.paymentQueue = null;
  }
  const continuation = state.boardState.paymentQueue
    ? settleAffordableClaims(state, options)
    : queueContinuation;
  if (tileIds.length > 0) {
    enqueueBankPropertyAuctions(state, tileIds, queueContinuation);
    return { changed: true, continuation, bankAuctionQueued: true };
  }
  if (!state.boardState.paymentQueue) checkWinner(state);
  return { changed: true, continuation, bankAuctionQueued: false };
};

/** Explicit in-game leave without a player debt uses the same Bank pipeline. */
export const surrenderPlayerToBank = (
  state: GameState,
  playerId: PlayerId,
  options: Pick<QueuePaymentOptions, 'now' | 'debtActionTimeoutMs'> = {},
): BankruptcyResult => {
  const active = activeDebtClaim(state);
  if (active?.debtorPlayerId === playerId) {
    const result = declareActiveDebtBankruptcy(state, playerId, options);
    if (result.changed && state.boardState.finishedPlayers[playerId]) {
      state.boardState.finishedPlayers[playerId].reason = 'LEFT';
    }
    return result;
  }
  const player = state.players[playerId];
  if (!player) return { changed: false, continuation: null, bankAuctionQueued: false };
  const wasCurrent = state.boardState.currentPlayer.id === playerId;
  let continuation: PendingTurnContinuation = {
    playerId: state.boardState.currentPlayer.id || playerId,
    turnNumber: state.boardState.turnNumber,
    rolledDoubles: false,
    forceAdvance: false,
    resume: { kind: 'NO_TURN_CHANGE' },
  };
  liquidateBuildings(state, playerId);
  player.accountBalance = 0;
  returnHeldCardsToDeck(state, playerId);
  const tileIds = ownedTileIds(state, playerId);
  for (const tileID of tileIds) transferProperty(state, tileID, playerId, null, 'RETURN_TO_BANK');
  closeClaimsForEliminatedDebtor(state, playerId);
  removePlayerFromGame(state, playerId, 'LEFT', {
    deferWinner: tileIds.length > 0 || Boolean(state.boardState.paymentQueue),
  });
  rebaseContinuationAfterElimination(state, playerId);
  if (wasCurrent && state.boardState.currentPlayer.id) {
    continuation = {
      playerId: state.boardState.currentPlayer.id,
      turnNumber: state.boardState.turnNumber,
      rolledDoubles: false,
      resume: { kind: 'NO_TURN_CHANGE' },
    };
  }
  if (tileIds.length > 0) {
    enqueueBankPropertyAuctions(state, tileIds, continuation);
    return { changed: true, continuation: null, bankAuctionQueued: true };
  }
  if (wasCurrent && !state.boardState.winner) checkWinner(state);
  return { changed: true, continuation, bankAuctionQueued: false };
};
