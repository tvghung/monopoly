import type {
  GameplaySemanticEvent,
  PassGoSemanticEvent,
  PendingCardInteraction,
  PublicRoomState,
} from '@monopoly/shared';
import type { PresentationEvent, PresentationEventType } from './types';

const MAX_WALK = 12;
const BOARD_SIZE = 40;

function forwardDistance(from: number, to: number): number {
  return ((to - from) % BOARD_SIZE + BOARD_SIZE) % BOARD_SIZE;
}

function eventId(room: PublicRoomState, type: PresentationEventType, entityId: string): string {
  return `${room.roomId}:revision-${room.version}:${type}:${entityId}`;
}

function rollEventId(room: PublicRoomState, rollSequence: number): string {
  return `${room.roomId}:roll-${rollSequence}`;
}

function sortedIds(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isValidDiceValue(dice1: number, dice2: number): boolean {
  return Number.isInteger(dice1) && dice1 >= 1 && dice1 <= 6
    && Number.isInteger(dice2) && dice2 >= 1 && dice2 <= 6;
}

function isProvenDiceMovement(
  previous: PublicRoomState,
  next: PublicRoomState,
  playerId: string,
  previousTile: number,
  nextTile: number,
  previousIsJail: boolean,
): boolean {
  const previousBoard = previous.gameState.boardState;
  const nextBoard = next.gameState.boardState;
  const dice = nextBoard.diceValue;
  if (
    nextBoard.rollSequence !== previousBoard.rollSequence + 1
    || previous.status !== 'IN_PROGRESS'
    || !previousBoard.gameStarted
    || Boolean(previousBoard.winner)
    || previousBoard.currentPlayer.id !== playerId
    || previousBoard.currentPlayer.hasMoved
    || Boolean(previous.gameState.turnInfo.pendingLandingDecision)
    || Boolean(previous.gameState.turnInfo.pendingCardInteraction)
    || Boolean(previousBoard.paymentShortfall)
    || !isValidDiceValue(dice.dice1, dice.dice2)
  ) return false;
  if (previousIsJail && dice.dice1 !== dice.dice2) return false;
  if (previousIsJail && next.gameState.players[playerId]?.isJail) return false;
  return nextTile === (previousTile + dice.dice1 + dice.dice2) % BOARD_SIZE;
}

export function semanticEventsSince(
  previous: PublicRoomState,
  next: PublicRoomState,
): GameplaySemanticEvent[] | null {
  const previousSequence = previous.gameState.boardState.gameplayEvents.sequence;
  const stream = next.gameState.boardState.gameplayEvents;
  if (stream.sequence < previousSequence) return null;
  if (stream.sequence === previousSequence) return [];
  const events = stream.events
    .filter(event => event.sequence > previousSequence)
    .sort((left, right) => left.sequence - right.sequence);
  if (
    events.length !== stream.sequence - previousSequence
    || events[0]?.sequence !== previousSequence + 1
    || events.at(-1)?.sequence !== stream.sequence
  ) return null;
  return events;
}

function cardEvent(
  room: PublicRoomState,
  interaction: PendingCardInteraction,
  stage: 'AWAITING_DRAW' | 'REVEALED' | 'CLOSED',
): PresentationEvent {
  return {
    id: `${room.roomId}:card-${interaction.operationId}:${stage}`,
    roomId: room.roomId,
    roomVersion: room.version,
    type: 'CARD_INTERACTION_CHANGED',
    entityId: interaction.operationId,
    operationId: interaction.operationId,
    playerId: interaction.playerId,
    deck: interaction.deck,
    sourceTile: interaction.sourceTile,
    stage,
  };
}

function deriveCardEvents(previous: PublicRoomState, next: PublicRoomState): PresentationEvent[] {
  const before = previous.gameState.turnInfo.pendingCardInteraction;
  const after = next.gameState.turnInfo.pendingCardInteraction;
  const events: PresentationEvent[] = [];
  if (before && before.operationId !== after?.operationId) events.push(cardEvent(next, before, 'CLOSED'));
  if (!after) return events;
  if (before?.operationId !== after.operationId || before.stage !== after.stage) {
    events.push(cardEvent(next, after, after.stage));
  }
  return events;
}

function deriveSemanticPresentationEvents(
  room: PublicRoomState,
  semanticEvents: readonly GameplaySemanticEvent[],
  suppressedIds: ReadonlySet<string>,
): PresentationEvent[] {
  const result: PresentationEvent[] = [];
  const consumed = new Set<string>();
  for (const event of semanticEvents) {
    if (suppressedIds.has(event.eventId) || consumed.has(event.eventId)) continue;
    const base = {
      id: event.eventId,
      roomId: room.roomId,
      roomVersion: room.version,
      entityId: event.operationId ?? event.eventId,
    };
    switch (event.type) {
      case 'MONEY_TRANSFER':
        result.push({
          ...base,
          type: 'MONEY_TRANSFER',
          source: event.source,
          destination: event.destination,
          amount: event.amount,
          reason: event.reason,
          ...(event.operationId ? { operationId: event.operationId } : {}),
        });
        break;
      case 'PROPERTY_TRANSFER': {
        const operationId = event.operationId ?? event.eventId;
        const grouped = semanticEvents.filter((candidate): candidate is Extract<GameplaySemanticEvent, { type: 'PROPERTY_TRANSFER' }> => (
          candidate.type === 'PROPERTY_TRANSFER'
          && !suppressedIds.has(candidate.eventId)
          && !consumed.has(candidate.eventId)
          && candidate.cause === event.cause
          && (candidate.operationId ?? candidate.eventId) === operationId
        ));
        const purchaseMoney = event.cause === 'BANK_PURCHASE'
          ? semanticEvents.find(candidate => (
              candidate.type === 'MONEY_TRANSFER'
              && candidate.reason === 'PROPERTY_PURCHASE'
              && candidate.destination.kind === 'BANK'
              && (candidate.operationId ?? candidate.eventId) === operationId
            ))
          : undefined;
        grouped.forEach(candidate => consumed.add(candidate.eventId));
        result.push({
          ...base,
          type: 'PROPERTY_TRANSFER',
          cause: event.cause,
          ...(purchaseMoney?.type === 'MONEY_TRANSFER' ? { amount: purchaseMoney.amount } : {}),
          ...(event.operationId ? { operationId: event.operationId } : {}),
          transfers: grouped.map(transfer => ({
            eventId: transfer.eventId,
            tileId: transfer.tileID,
            fromPlayerId: transfer.from.kind === 'PLAYER' ? transfer.from.playerId : null,
            toPlayerId: transfer.to.kind === 'PLAYER' ? transfer.to.playerId : null,
          })),
        });
        break;
      }
      case 'PASS_GO':
        result.push({ ...base, type: 'PASS_GO', event });
        break;
      case 'SENT_TO_JAIL':
        result.push({ ...base, type: 'SENT_TO_JAIL', event });
        break;
      case 'JAIL_ROLL_FAILED':
        result.push({ ...base, type: 'JAIL_ROLL_FAILED', playerId: event.playerId });
        break;
      case 'JAIL_RELEASED':
        result.push({ ...base, type: 'JAIL_RELEASED', playerId: event.playerId, cause: event.cause });
        break;
      default:
        break;
    }
  }
  return result;
}

export function derivePresentationEvents(
  previous: PublicRoomState,
  next: PublicRoomState,
): PresentationEvent[] {
  if (previous.roomId !== next.roomId || next.version <= previous.version) return [];
  const semanticEvents = semanticEventsSince(previous, next) ?? [];
  const passGoEvents = semanticEvents.filter(
    (event): event is PassGoSemanticEvent => event.type === 'PASS_GO',
  );
  const sentToJailPlayers = new Set(
    semanticEvents.filter(event => event.type === 'SENT_TO_JAIL').map(event => event.playerId),
  );
  const jailSemanticPlayers = new Set(
    semanticEvents
      .filter(event => ['SENT_TO_JAIL', 'JAIL_ROLL_FAILED', 'JAIL_RELEASED'].includes(event.type))
      .map(event => 'playerId' in event ? event.playerId : ''),
  );
  const semanticPropertyTiles = new Set(
    semanticEvents.filter(event => event.type === 'PROPERTY_TRANSFER').map(event => event.tileID),
  );
  const suppressedSemanticIds = new Set<string>();
  passGoEvents.forEach(passGo => {
    const matchingMoney = semanticEvents.find(event => (
      event.type === 'MONEY_TRANSFER'
      && event.reason === 'PASS_GO'
      && event.destination.kind === 'PLAYER'
      && event.destination.playerId === passGo.playerId
      && event.amount === passGo.reward
      && (event.operationId ?? null) === (passGo.operationId ?? null)
    ));
    if (matchingMoney) suppressedSemanticIds.add(matchingMoney.eventId);
  });
  const previousGame = previous.gameState;
  const nextGame = next.gameState;
  const diceEvents: PresentationEvent[] = [];
  const movementEvents: PresentationEvent[] = [];
  const landingEvents: PresentationEvent[] = [];
  const balanceEvents: PresentationEvent[] = [];
  const ownershipEvents: PresentationEvent[] = [];
  const developmentEvents: PresentationEvent[] = [];
  const jailEvents: PresentationEvent[] = [];
  const finishedEvents: PresentationEvent[] = [];
  const turnEvents: PresentationEvent[] = [];
  const gameEvents: PresentationEvent[] = [];

  if (nextGame.boardState.rollSequence - previousGame.boardState.rollSequence === 1) {
    diceEvents.push({
      id: rollEventId(next, nextGame.boardState.rollSequence),
      roomId: next.roomId,
      roomVersion: next.version,
      type: 'ROLL_DICE',
      entityId: 'room',
      dice1: nextGame.boardState.diceValue.dice1,
      dice2: nextGame.boardState.diceValue.dice2,
      rollSequence: nextGame.boardState.rollSequence,
    });
  }

  for (const playerId of sortedIds([...Object.keys(previousGame.players), ...Object.keys(nextGame.players)])) {
    const oldPlayer = previousGame.players[playerId];
    const newPlayer = nextGame.players[playerId];
    if (!oldPlayer || !newPlayer) continue;
    if (oldPlayer.currentTile !== newPlayer.currentTile && !sentToJailPlayers.has(playerId)) {
      const steps = forwardDistance(oldPlayer.currentTile, newPlayer.currentTile);
      const walk = isProvenDiceMovement(
        previous,
        next,
        playerId,
        oldPlayer.currentTile,
        newPlayer.currentTile,
        oldPlayer.isJail,
      ) && steps > 0 && steps <= MAX_WALK;
      const passGo = walk ? passGoEvents.find(event => (
        event.playerId === playerId
        && event.movement.kind === 'DICE_WALK'
        && event.movement.rollSequence === nextGame.boardState.rollSequence
      )) : undefined;
      if (passGo) {
        suppressedSemanticIds.add(passGo.eventId);
      }
      movementEvents.push({
        id: eventId(next, 'MOVE_CHARACTER', playerId),
        roomId: next.roomId,
        roomVersion: next.version,
        type: 'MOVE_CHARACTER',
        entityId: playerId,
        playerId,
        from: oldPlayer.currentTile,
        to: newPlayer.currentTile,
        steps,
        presentation: walk ? 'WALK' : 'SNAP',
        ...(passGo ? { passGo } : {}),
      });
      landingEvents.push({
        id: eventId(next, 'LAND_TILE', playerId),
        roomId: next.roomId,
        roomVersion: next.version,
        type: 'LAND_TILE',
        entityId: playerId,
        playerId,
        tileId: newPlayer.currentTile,
      });
    }
    if (oldPlayer.accountBalance !== newPlayer.accountBalance) {
      balanceEvents.push({
        id: eventId(next, 'BALANCE_CHANGED', playerId),
        roomId: next.roomId,
        roomVersion: next.version,
        type: 'BALANCE_CHANGED',
        entityId: playerId,
        playerId,
        from: oldPlayer.accountBalance,
        to: newPlayer.accountBalance,
      });
    }
    if (oldPlayer.isJail !== newPlayer.isJail && !jailSemanticPlayers.has(playerId)) {
      jailEvents.push({
        id: eventId(next, 'JAIL_STATE_CHANGED', playerId),
        roomId: next.roomId,
        roomVersion: next.version,
        type: 'JAIL_STATE_CHANGED',
        entityId: playerId,
        playerId,
        isJail: newPlayer.isJail,
      });
    }
  }

  const propertyIds = [...new Set([
    ...Object.keys(previousGame.boardState.ownedProps),
    ...Object.keys(nextGame.boardState.ownedProps),
  ])].sort((left, right) => Number(left) - Number(right));
  for (const propertyId of propertyIds) {
    const tileId = Number(propertyId);
    const oldProperty = previousGame.boardState.ownedProps[tileId];
    const newProperty = nextGame.boardState.ownedProps[tileId];
    if ((oldProperty?.id ?? null) !== (newProperty?.id ?? null) && !semanticPropertyTiles.has(tileId)) {
      ownershipEvents.push({
        id: eventId(next, 'PROPERTY_OWNERSHIP_CHANGED', propertyId),
        roomId: next.roomId,
        roomVersion: next.version,
        type: 'PROPERTY_OWNERSHIP_CHANGED',
        entityId: propertyId,
        tileId,
        fromPlayerId: oldProperty?.id ?? null,
        toPlayerId: newProperty?.id ?? null,
      });
    }
    if (oldProperty && newProperty && oldProperty.houses !== newProperty.houses) {
      developmentEvents.push({
        id: eventId(next, 'PROPERTY_DEVELOPMENT_CHANGED', propertyId),
        roomId: next.roomId,
        roomVersion: next.version,
        type: 'PROPERTY_DEVELOPMENT_CHANGED',
        entityId: propertyId,
        tileId,
        playerId: newProperty.id,
        fromHouses: oldProperty.houses,
        toHouses: newProperty.houses,
      });
    }
  }

  for (const playerId of sortedIds([
    ...Object.keys(previousGame.boardState.finishedPlayers),
    ...Object.keys(nextGame.boardState.finishedPlayers),
  ])) {
    const oldFinished = previousGame.boardState.finishedPlayers[playerId];
    const newFinished = nextGame.boardState.finishedPlayers[playerId];
    if (oldFinished?.reason === newFinished?.reason && Boolean(oldFinished) === Boolean(newFinished)) continue;
    finishedEvents.push({
      id: eventId(next, 'PLAYER_FINISHED', playerId),
      roomId: next.roomId,
      roomVersion: next.version,
      type: 'PLAYER_FINISHED',
      entityId: playerId,
      playerId,
      reason: newFinished?.reason ?? null,
    });
  }

  if (previousGame.boardState.currentPlayer.id !== nextGame.boardState.currentPlayer.id) {
    turnEvents.push({
      id: eventId(next, 'TURN_CHANGED', 'turn'),
      roomId: next.roomId,
      roomVersion: next.version,
      type: 'TURN_CHANGED',
      entityId: 'turn',
      fromPlayerId: previousGame.boardState.currentPlayer.id,
      toPlayerId: nextGame.boardState.currentPlayer.id,
    });
  }
  const previousWinner = previousGame.boardState.winner?.playerId ?? null;
  const nextWinner = nextGame.boardState.winner?.playerId ?? null;
  if (previousWinner !== nextWinner) {
    gameEvents.push({
      id: eventId(next, 'GAME_FINISHED', 'game'),
      roomId: next.roomId,
      roomVersion: next.version,
      type: 'GAME_FINISHED',
      entityId: 'game',
      winnerPlayerId: nextWinner,
    });
  }

  const cardEvents = deriveCardEvents(previous, next);
  const closesExistingCard = Boolean(previousGame.turnInfo.pendingCardInteraction);
  const closingCardEvents = cardEvents.filter(event => (
    event.type === 'CARD_INTERACTION_CHANGED' && event.stage === 'CLOSED'
  ));
  const openingCardEvents = cardEvents.filter(event => (
    event.type !== 'CARD_INTERACTION_CHANGED' || event.stage !== 'CLOSED'
  ));
  const semanticPresentationEvents = deriveSemanticPresentationEvents(next, semanticEvents, suppressedSemanticIds);
  return [
    ...diceEvents,
    ...(closesExistingCard ? closingCardEvents : []),
    ...movementEvents,
    ...landingEvents,
    ...semanticPresentationEvents,
    ...(closesExistingCard ? openingCardEvents : cardEvents),
    ...balanceEvents,
    ...ownershipEvents,
    ...developmentEvents,
    ...jailEvents,
    ...finishedEvents,
    ...turnEvents,
    ...gameEvents,
  ];
}
