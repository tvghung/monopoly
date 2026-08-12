import { randomUUID } from 'node:crypto';
import {
  CHANCE_TILE_INDICES,
  CHEST_TILE_INDICES,
  RAILROAD_TILE_INDICES,
  UTILITY_TILE_INDICES,
  gameCardsById,
  tileState,
  type CardDeck,
  type DiceValue,
  type GameCard,
  type GameState,
  type PendingTurnContinuation,
  type PlayerId,
} from '@monopoly/shared';
import { moveBy, moveToJail, moveToTile } from './dice';
import {
  enqueuePayments,
  logPausedDebt,
  settleAffordableClaims,
  type CompulsoryPayment,
} from './payment';
import { streetRent } from './property';
import { sendToLog } from './text';
import { completeTurnResolution } from './turn';

export interface TileResolutionOptions {
  now?: number;
  debtActionTimeoutMs?: number;
}

const orderedOtherPlayers = (state: GameState, playerId: PlayerId): PlayerId[] => {
  const order = state.boardState.players.filter((id) => id !== playerId && state.players[id]);
  const actorIndex = state.boardState.players.indexOf(playerId);
  if (actorIndex < 0) return order;
  const cyclic = [
    ...state.boardState.players.slice(actorIndex + 1),
    ...state.boardState.players.slice(0, actorIndex),
  ];
  return cyclic.filter((id) => id !== playerId && Boolean(state.players[id]));
};

const payment = (
  debtorPlayerId: PlayerId,
  creditor: 'BANK' | 'PLAYER',
  amount: number,
  source: CompulsoryPayment['source'],
  creditorPlayerId?: PlayerId,
): CompulsoryPayment => ({ debtorPlayerId, creditor, creditorPlayerId, amount, source });

const processPayments = (
  state: GameState,
  payments: CompulsoryPayment[],
  continuation: PendingTurnContinuation,
  options: TileResolutionOptions = {},
): boolean => {
  if (payments.length === 0) return true;
  enqueuePayments(state, payments, continuation, options);
  const resumed = settleAffordableClaims(state, options);
  if (!resumed) {
    logPausedDebt(state);
    return false;
  }
  return true;
};

const drawCard = (state: GameState, deckName: CardDeck): GameCard => {
  const deck = state.privateState.decks[deckName].drawPile;
  const cardId = deck.shift();
  if (!cardId) throw new Error(`Bộ thẻ ${deckName} không còn lá để rút.`);
  const card = gameCardsById[cardId];
  if (!card) throw new Error(`Không tìm thấy thẻ ${cardId}.`);
  if (!card.getOutOfJailFree) deck.push(cardId);
  return card;
};

const resolveOwnedProperty = (
  state: GameState,
  playerId: PlayerId,
  tileID: number,
  amount: number,
  continuation: PendingTurnContinuation,
  options: TileResolutionOptions = {},
): boolean => {
  const property = state.boardState.ownedProps[tileID];
  if (!property) {
    state.turnInfo.canBuyProp = true;
    state.turnInfo.pendingPropertyDecision = {
      operationId: randomUUID(),
      playerId,
      tileID,
      continuation,
    };
    return false;
  }
  if (property.id === playerId || amount <= 0) return true;
  return processPayments(
    state,
    [payment(playerId, 'PLAYER', amount, { kind: 'RENT', tileID }, property.id)],
    continuation,
    options,
  );
};

export const railroadRent = (state: GameState, tileID: number): number => {
  const landed = state.boardState.ownedProps[tileID];
  if (!landed || landed.mortgaged) return 0;
  const count = RAILROAD_TILE_INDICES.filter(
    (id) => state.boardState.ownedProps[id]?.id === landed.id,
  ).length;
  return count > 0 ? 25 * 2 ** (count - 1) : 0;
};

export const utilityRent = (state: GameState, tileID: number, diceTotal: number): number => {
  const landed = state.boardState.ownedProps[tileID];
  if (!landed || landed.mortgaged) return 0;
  const count = UTILITY_TILE_INDICES.filter(
    (id) => state.boardState.ownedProps[id]?.id === landed.id,
  ).length;
  return diceTotal * (count === 2 ? 10 : 4);
};

interface CardResolutionResult {
  continueDestination: boolean;
  forceAdvance: boolean;
}

export const applyCard = (
  state: GameState,
  playerId: PlayerId,
  card: GameCard,
  continuation?: PendingTurnContinuation,
  options: TileResolutionOptions = {},
): CardResolutionResult => {
  const player = state.players[playerId];
  if (!player) return { continueDestination: false, forceAdvance: true };
  sendToLog(state, `${player.name}: ${card.message}`);
  if (card.reward) player.accountBalance += card.reward;
  if (card.getOutOfJailFree) player.heldJailFreeCardIds.push(card.id);

  const resume = continuation ?? {
    playerId,
    turnNumber: state.boardState.turnNumber,
    rolledDoubles: false,
  };
  const payments: CompulsoryPayment[] = [];
  if (card.penalty) payments.push(payment(playerId, 'BANK', card.penalty, { kind: 'CARD', cardId: card.id }));
  if (card.payEachPlayer) {
    for (const otherId of orderedOtherPlayers(state, playerId)) {
      payments.push(payment(playerId, 'PLAYER', card.payEachPlayer, { kind: 'CARD', cardId: card.id }, otherId));
    }
  }
  if (card.collectFromEachPlayer) {
    for (const otherId of orderedOtherPlayers(state, playerId)) {
      payments.push(payment(otherId, 'PLAYER', card.collectFromEachPlayer, { kind: 'CARD', cardId: card.id }, playerId));
    }
  }
  if (payments.length > 0 && !processPayments(state, payments, resume, options)) {
    return { continueDestination: false, forceAdvance: false };
  }

  if (card.goToJail) {
    moveToJail(state, playerId);
    return { continueDestination: false, forceAdvance: true };
  }
  if (typeof card.moveToTile === 'number') {
    moveToTile(state, playerId, card.moveToTile);
    return { continueDestination: true, forceAdvance: false };
  }
  if (typeof card.moveBy === 'number') {
    moveBy(state, playerId, card.moveBy);
    return { continueDestination: true, forceAdvance: false };
  }
  return { continueDestination: false, forceAdvance: false };
};

/** Resolve the destination synchronously until an external wait is encountered. */
export const resolveTile = (
  state: GameState,
  playerId: PlayerId,
  diceResult: number,
  continuation: PendingTurnContinuation = {
    playerId,
    turnNumber: state.boardState.turnNumber,
    rolledDoubles: false,
  },
  options: TileResolutionOptions = {},
): void => {
  const player = state.players[playerId];
  if (!player) return;
  let chainDepth = 0;
  while (chainDepth < 32 && state.players[playerId] && !state.boardState.paymentQueue) {
    chainDepth += 1;
    const tileID = player.currentTile;
    const tile = tileState[tileID];
    let complete = true;
    let forceAdvance = continuation.forceAdvance ?? false;

    switch (tile.tileType) {
      case 'normal':
        complete = resolveOwnedProperty(state, playerId, tileID, streetRent(state, tileID), continuation, options);
        break;
      case 'railroad':
        complete = resolveOwnedProperty(state, playerId, tileID, railroadRent(state, tileID), continuation, options);
        break;
      case 'company':
        complete = resolveOwnedProperty(state, playerId, tileID, utilityRent(state, tileID, diceResult), continuation, options);
        break;
      case 'expense':
        complete = processPayments(
          state,
          [payment(playerId, 'BANK', tile.rent ?? 0, { kind: 'TAX', tileID })],
          continuation,
          options,
        );
        break;
      case 'gojail':
        moveToJail(state, playerId);
        forceAdvance = true;
        break;
      case 'chance':
      case 'chest': {
        const card = drawCard(state, tile.tileType);
        const result = applyCard(state, playerId, card, continuation, options);
        if (!result.continueDestination) {
          forceAdvance ||= result.forceAdvance;
          break;
        }
        continue;
      }
      case 'parking':
        sendToLog(state, `${player.name} dừng tại Bãi Đỗ Xe.`);
        break;
      case 'jail':
        if (!player.isJail) sendToLog(state, `${player.name} chỉ đang Thăm Tù.`);
        break;
      default:
        break;
    }

    if (!complete || state.boardState.paymentQueue || state.turnInfo.pendingPropertyDecision) return;
    completeTurnResolution(state, { ...continuation, forceAdvance });
    return;
  }
  if (chainDepth >= 32) throw new Error('Chuỗi thẻ vượt quá giới hạn an toàn.');
};

// Compatibility helper retained for callers while ownership waits move into resolveTile.
export const checkOwned = (
  state: GameState,
  playerId: PlayerId,
  currentTile: number,
  payRent: () => void,
): void => {
  const owned = state.boardState.ownedProps[currentTile];
  if (!owned) state.turnInfo.canBuyProp = true;
  else if (owned.id !== playerId) payRent();
};

export const handleJailRoll = (
  state: GameState,
  playerId: PlayerId,
  dice: DiceValue,
  continuation?: PendingTurnContinuation,
  options: TileResolutionOptions = {},
): void => {
  const player = state.players[playerId];
  if (!player) return;
  const total = dice.dice1 + dice.dice2;
  const isDoubles = dice.dice1 === dice.dice2;
  const resume: PendingTurnContinuation = continuation ?? {
    playerId,
    turnNumber: state.boardState.turnNumber,
    rolledDoubles: false,
    forceAdvance: true,
  };
  state.boardState.diceValue = dice;
  state.boardState.currentPlayer.hasMoved = true;

  if (isDoubles) {
    player.isJail = false;
    player.jailRounds = 0;
    moveBy(state, playerId, total);
    sendToLog(state, `${player.name} đổ đôi và được ra tù.`);
    resolveTile(state, playerId, total, { ...resume, rolledDoubles: false, forceAdvance: true }, options);
    return;
  }
  if (player.jailRounds < 2) {
    player.jailRounds += 1;
    sendToLog(state, `${player.name} chưa đổ được đôi và tiếp tục ở tù.`);
    completeTurnResolution(state, { ...resume, rolledDoubles: false, forceAdvance: true });
    return;
  }

  const bailContinuation: PendingTurnContinuation = {
    ...resume,
    rolledDoubles: false,
    forceAdvance: true,
    resume: { kind: 'MOVE_STORED_DICE', dice },
  };
  if (!processPayments(state, [payment(playerId, 'BANK', 50, { kind: 'BAIL' })], bailContinuation, options)) return;
  player.isJail = false;
  player.jailRounds = 0;
  moveBy(state, playerId, total);
  resolveTile(state, playerId, total, { ...bailContinuation, resume: { kind: 'COMPLETE_TURN' } }, options);
};

export const resumePaymentContinuation = (
  state: GameState,
  continuation: PendingTurnContinuation,
  options: TileResolutionOptions = {},
): void => {
  if (continuation.resume?.kind === 'RELEASE_FROM_JAIL') {
    if (
      state.boardState.currentPlayer.id !== continuation.playerId
      || state.boardState.turnNumber !== continuation.turnNumber
      || !state.players[continuation.playerId]?.isJail
    ) return;
    const player = state.players[continuation.playerId];
    player.isJail = false;
    player.jailRounds = 0;
    sendToLog(state, `${player.name} đã trả 50.000 ₫ tiền bảo lãnh và được ra tù.`);
    return;
  }
  if (continuation.resume?.kind === 'MOVE_STORED_DICE') {
    if (
      state.boardState.currentPlayer.id !== continuation.playerId
      || state.boardState.turnNumber !== continuation.turnNumber
      || !state.players[continuation.playerId]
    ) return;
    const player = state.players[continuation.playerId];
    player.isJail = false;
    player.jailRounds = 0;
    const dice = continuation.resume.dice;
    const total = dice.dice1 + dice.dice2;
    moveBy(state, continuation.playerId, total);
    resolveTile(state, continuation.playerId, total, {
      ...continuation,
      resume: { kind: 'COMPLETE_TURN' },
    }, options);
    return;
  }
  completeTurnResolution(state, continuation);
};

export const cardTileIndices = {
  chance: CHANCE_TILE_INDICES,
  chest: CHEST_TILE_INDICES,
};
