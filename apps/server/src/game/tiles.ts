import { randomUUID } from 'node:crypto';
import {
  CHANCE_TILE_INDICES,
  CHEST_TILE_INDICES,
  formatMoney,
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
  type CompulsoryPayment,
} from './payment';
import { progressPaymentQueue } from './paymentResolution';
import { streetRent } from './property';
import { sendToLog } from './text';
import { completeTurnResolution } from './turn';
import { recordPublicGameplayEvent } from './semanticEvents';
import { activityPlayerName, recordActivityEvent } from './activity';

export interface TileResolutionOptions {
  now?: number;
  paymentShortfallActionTimeoutMs?: number;
  cardAwaitingDrawTimeoutMs?: number;
  cardRevealedTimeoutMs?: number;
  resolutionCause?: RentResolutionCause;
}

export const DEFAULT_CARD_AWAITING_DRAW_TIMEOUT_MS = 20_000;
export const DEFAULT_CARD_REVEALED_TIMEOUT_MS = 30_000;

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
  const progress = progressPaymentQueue(state, options);
  if (progress.status !== 'COMPLETED') {
    if (progress.status === 'WAITING_FOR_LIQUIDATION') {
      sendToLog(state, 'Cần bán tài sản để tiếp tục thanh toán bắt buộc.');
    }
    return false;
  }
  return true;
};

const takeTopCard = (state: GameState, deckName: CardDeck): GameCard => {
  const deck = state.privateState.decks[deckName].drawPile;
  const cardId = deck.shift();
  if (!cardId) throw new Error(`Bộ thẻ ${deckName} không còn lá để rút.`);
  const card = gameCardsById[cardId];
  if (!card) throw new Error(`Không tìm thấy thẻ ${cardId}.`);
  return card;
};

const beginCardInteraction = (
  state: GameState,
  playerId: PlayerId,
  deck: CardDeck,
  sourceTile: number,
  continuation: PendingTurnContinuation,
  options: TileResolutionOptions,
): void => {
  const now = options.now ?? Date.now();
  state.turnInfo.pendingCardInteraction = {
    operationId: randomUUID(),
    playerId,
    turnNumber: state.boardState.turnNumber,
    deck,
    sourceTile,
    stage: 'AWAITING_DRAW',
    continuation,
    deadlineAt: new Date(
      now + (options.cardAwaitingDrawTimeoutMs ?? DEFAULT_CARD_AWAITING_DRAW_TIMEOUT_MS),
    ).toISOString(),
  };
};

const resolveOwnedProperty = (
  state: GameState,
  playerId: PlayerId,
  tileID: number,
  amount: number,
  continuation: PendingTurnContinuation,
  diceResult: number,
  cause: RentResolutionCause,
  options: TileResolutionOptions = {},
): boolean => {
  const property = state.boardState.ownedProps[tileID];
  if (!property) {
    state.turnInfo.pendingPropertyDecision = {
      operationId: randomUUID(),
      playerId,
      tileID,
      continuation,
    };
    return false;
  }
  if (property.id === playerId || amount <= 0) {
    const tile = tileState[tileID];
    if (
      property.id === playerId
      && tile?.tileType === 'normal'
      && property.houses < 5
    ) {
      state.turnInfo.pendingDevelopmentDecision = {
        operationId: randomUUID(),
        playerId,
        turnNumber: state.boardState.turnNumber,
        tileID,
        levelAtLanding: property.houses as 0 | 1 | 2 | 3 | 4,
        kind: property.houses === 4 ? 'HOTEL' : 'HOUSES',
        continuation,
      };
      return false;
    }
    return true;
  }
  logRentLiability(state, playerId, tileID, amount, diceResult, cause);
  return processPayments(
    state,
    [payment(playerId, 'PLAYER', amount, { kind: 'RENT', tileID }, property.id)],
    continuation,
    options,
  );
};

export const railroadRent = (state: GameState, tileID: number): number => {
  const landed = state.boardState.ownedProps[tileID];
  if (!landed) return 0;
  const count = RAILROAD_TILE_INDICES.filter(
    (id) => state.boardState.ownedProps[id]?.id === landed.id,
  ).length;
  return count > 0 ? 25 * 2 ** (count - 1) : 0;
};

export const utilityRent = (state: GameState, tileID: number, diceTotal: number): number => {
  const landed = state.boardState.ownedProps[tileID];
  if (!landed) return 0;
  const count = UTILITY_TILE_INDICES.filter(
    (id) => state.boardState.ownedProps[id]?.id === landed.id,
  ).length;
  return diceTotal * (count === 2 ? 10 : 4);
};

interface CardResolutionResult {
  continueDestination: boolean;
  awaitingExternalResolution: boolean;
}

type RentResolutionCause = 'DICE' | 'CARD';

const rentPropertyLabel = (tileID: number, houses: number): string => {
  const tile = tileState[tileID];
  if (tile?.tileType === 'normal' && houses === 5) return `Khách sạn tại ${tile.streetName}`;
  if (tile?.tileType === 'normal' && houses > 0) return `${houses} Nhà tại ${tile.streetName}`;
  return tile?.streetName ?? `ô ${tileID}`;
};

const logRentLiability = (
  state: GameState,
  debtorPlayerId: PlayerId,
  tileID: number,
  amount: number,
  diceResult: number,
  cause: RentResolutionCause,
): void => {
  if (amount <= 0) return;
  const debtor = state.players[debtorPlayerId];
  const property = state.boardState.ownedProps[tileID];
  const owner = property ? state.players[property.id] : undefined;
  if (!debtor || !property || property.id === debtorPlayerId || !owner) return;
  const diceCopy = cause === 'DICE' ? `${debtor.name} đổ được ${diceResult} và ` : `${debtor.name} `;
  sendToLog(
    state,
    `${diceCopy}phải trả ${formatMoney(amount)} tiền thuê ${rentPropertyLabel(tileID, property.houses)} cho ${owner.name}.`,
  );
};

export const applyCard = (
  state: GameState,
  playerId: PlayerId,
  card: GameCard,
  continuation?: PendingTurnContinuation,
  options: TileResolutionOptions = {},
  operationId?: string,
): CardResolutionResult => {
  const player = state.players[playerId];
  if (!player) return { continueDestination: false, awaitingExternalResolution: false };
  sendToLog(state, `${player.name}: ${card.message}`);
  if (card.reward) {
    player.accountBalance += card.reward;
    recordPublicGameplayEvent(state, {
      type: 'MONEY_TRANSFER',
      source: { kind: 'BANK' },
      destination: { kind: 'PLAYER', playerId },
      amount: card.reward,
      reason: 'CARD',
      ...(operationId ? { operationId } : {}),
    });
  }
  if (card.getOutOfJailFree) player.heldJailFreeCardIds.push(card.id);

  const resume = continuation ?? {
    playerId,
    turnNumber: state.boardState.turnNumber,
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
    return { continueDestination: false, awaitingExternalResolution: true };
  }

  if (card.goToJail) {
    moveToJail(state, playerId, 'CARD', operationId);
    return { continueDestination: false, awaitingExternalResolution: false };
  }
  if (typeof card.moveToTile === 'number') {
    moveToTile(state, playerId, card.moveToTile, { kind: 'CARD', cardId: card.id }, operationId);
    return { continueDestination: true, awaitingExternalResolution: false };
  }
  if (typeof card.moveBy === 'number') {
    moveBy(state, playerId, card.moveBy, { kind: 'CARD', cardId: card.id }, operationId);
    return { continueDestination: true, awaitingExternalResolution: false };
  }
  return { continueDestination: false, awaitingExternalResolution: false };
};

export type CardCommandResult = 'APPLIED' | 'ALREADY_APPLIED' | 'STALE' | 'NOT_REVEALED';

export const drawPendingCard = (
  state: GameState,
  playerId: PlayerId,
  operationId: string,
  options: TileResolutionOptions = {},
): CardCommandResult => {
  if (state.privateState.completedCardOperations.some(
    operation => operation.operationId === operationId && operation.playerId === playerId,
  )) return 'ALREADY_APPLIED';
  const interaction = state.turnInfo.pendingCardInteraction;
  if (!interaction || interaction.operationId !== operationId || interaction.playerId !== playerId) {
    return 'STALE';
  }
  if (interaction.stage === 'REVEALED') return 'ALREADY_APPLIED';

  const card = takeTopCard(state, interaction.deck);
  interaction.stage = 'REVEALED';
  interaction.revealedCardId = card.id;
  recordActivityEvent(state, {
    type: 'CARD_REVEALED',
    playerId,
    playerName: activityPlayerName(state, playerId),
    deck: interaction.deck,
    cardId: card.id,
  });
  interaction.deadlineAt = new Date(
    (options.now ?? Date.now())
      + (options.cardRevealedTimeoutMs ?? DEFAULT_CARD_REVEALED_TIMEOUT_MS),
  ).toISOString();
  return 'APPLIED';
};

const rememberCompletedCardOperation = (
  state: GameState,
  operationId: string,
  playerId: PlayerId,
): void => {
  if (!state.privateState.completedCardOperations.some(
    operation => operation.operationId === operationId,
  )) {
    state.privateState.completedCardOperations.push({ operationId, playerId });
  }
  if (state.privateState.completedCardOperations.length > 64) {
    state.privateState.completedCardOperations.splice(
      0,
      state.privateState.completedCardOperations.length - 64,
    );
  }
};

export const dismissPendingCard = (
  state: GameState,
  playerId: PlayerId,
  operationId: string,
  options: TileResolutionOptions = {},
): CardCommandResult => {
  if (state.privateState.completedCardOperations.some(
    operation => operation.operationId === operationId && operation.playerId === playerId,
  )) return 'ALREADY_APPLIED';
  const interaction = state.turnInfo.pendingCardInteraction;
  if (!interaction || interaction.operationId !== operationId || interaction.playerId !== playerId) {
    return 'STALE';
  }
  if (interaction.stage !== 'REVEALED' || !interaction.revealedCardId) return 'NOT_REVEALED';

  const card = gameCardsById[interaction.revealedCardId];
  if (!card) throw new Error(`Không tìm thấy thẻ ${interaction.revealedCardId}.`);
  const continuation = interaction.continuation;
  if (!card.getOutOfJailFree) state.privateState.decks[interaction.deck].drawPile.push(card.id);
  delete state.turnInfo.pendingCardInteraction;
  rememberCompletedCardOperation(state, operationId, playerId);

  const result = applyCard(state, playerId, card, continuation, options, operationId);
  if (result.continueDestination) {
    resolveTile(state, playerId, state.boardState.diceValue.dice1 + state.boardState.diceValue.dice2, continuation, {
      ...options,
      resolutionCause: 'CARD',
    });
  } else if (!result.awaitingExternalResolution) {
    completeTurnResolution(state, continuation);
  }
  return 'APPLIED';
};

export const cancelPendingCardInteraction = (state: GameState): void => {
  const interaction = state.turnInfo.pendingCardInteraction;
  if (!interaction) return;
  if (interaction.revealedCardId) {
    state.privateState.decks[interaction.deck].drawPile.push(interaction.revealedCardId);
  }
  delete state.turnInfo.pendingCardInteraction;
};

/** Resolve the destination synchronously until an external wait is encountered. */
export const resolveTile = (
  state: GameState,
  playerId: PlayerId,
  diceResult: number,
  continuation: PendingTurnContinuation = {
    playerId,
    turnNumber: state.boardState.turnNumber,
  },
  options: TileResolutionOptions = {},
): void => {
  const player = state.players[playerId];
  if (!player) return;
  const resolutionCause: RentResolutionCause = options.resolutionCause ?? 'DICE';
    const tileID = player.currentTile;
    const tile = tileState[tileID];
    let complete = true;

    switch (tile.tileType) {
      case 'normal':
        complete = resolveOwnedProperty(
          state,
          playerId,
          tileID,
          streetRent(state, tileID),
          continuation,
          diceResult,
          resolutionCause,
          options,
        );
        break;
      case 'railroad':
        complete = resolveOwnedProperty(
          state,
          playerId,
          tileID,
          railroadRent(state, tileID),
          continuation,
          diceResult,
          resolutionCause,
          options,
        );
        break;
      case 'company':
        complete = resolveOwnedProperty(
          state,
          playerId,
          tileID,
          utilityRent(state, tileID, diceResult),
          continuation,
          diceResult,
          resolutionCause,
          options,
        );
        break;
      case 'expense':
        sendToLog(state, `${player.name} đến ô Thuế/Phí nhưng không phát sinh thanh toán.`);
        complete = true;
        break;
      case 'gojail':
        moveToJail(state, playerId, 'BOARD_TILE');
        break;
      case 'chance':
      case 'chest': {
        beginCardInteraction(state, playerId, tile.tileType, tileID, continuation, options);
        return;
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

    if (
      !complete
      || state.boardState.paymentQueue
      || state.turnInfo.pendingPropertyDecision
      || state.turnInfo.pendingDevelopmentDecision
      || state.turnInfo.pendingCardInteraction
    ) return;
    completeTurnResolution(state, continuation);
};

// Compatibility helper retained for callers while ownership waits move into resolveTile.
export const checkOwned = (
  state: GameState,
  playerId: PlayerId,
  currentTile: number,
  payRent: () => void,
): void => {
  const owned = state.boardState.ownedProps[currentTile];
  if (!owned) return;
  if (owned.id !== playerId) payRent();
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
  };
  state.boardState.diceValue = dice;
  state.boardState.currentPlayer.hasMoved = true;

  if (isDoubles) {
    player.isJail = false;
    player.jailOpponentRoundsElapsed = 0;
    recordPublicGameplayEvent(state, { type: 'JAIL_RELEASED', playerId, cause: 'DOUBLES' });
    moveBy(state, playerId, total, {
      kind: 'DICE_WALK',
      rollSequence: state.boardState.rollSequence,
    });
    sendToLog(state, `${player.name} đổ đôi và được ra tù.`);
    resolveTile(state, playerId, total, resume, options);
    return;
  }
  recordPublicGameplayEvent(state, { type: 'JAIL_ROLL_FAILED', playerId });
  sendToLog(state, `${player.name} chưa đổ được đôi và tiếp tục ở tù.`);
  completeTurnResolution(state, resume);
};

export const resumePaymentContinuation = (
  state: GameState,
  continuation: PendingTurnContinuation,
  options: TileResolutionOptions = {},
): void => {
  void options;
  completeTurnResolution(state, continuation);
};

export const cardTileIndices = {
  chance: CHANCE_TILE_INDICES,
  chest: CHEST_TILE_INDICES,
};
