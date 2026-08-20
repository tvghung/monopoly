import type { PublicRoomState } from '@monopoly/shared';
import type { PresentationEvent, PresentationEventType } from './types';

const MAX_WALK = 12;
const BOARD_SIZE = 40;

function forwardDistance(from: number, to: number): number {
  return ((to - from) % 40 + 40) % 40;
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
    || Boolean(previousBoard.paymentShortfall)
    || !isValidDiceValue(dice.dice1, dice.dice2)
  ) return false;

  if (previousIsJail && dice.dice1 !== dice.dice2) return false;
  if (previousIsJail && next.gameState.players[playerId]?.isJail) return false;

  const expectedTile = (previousTile + dice.dice1 + dice.dice2) % BOARD_SIZE;
  return nextTile === expectedTile;
}

export function derivePresentationEvents(
  previous: PublicRoomState,
  next: PublicRoomState,
): PresentationEvent[] {
  if (previous.roomId !== next.roomId || next.version <= previous.version) return [];

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

  const rollSequenceDelta = nextGame.boardState.rollSequence
    - previousGame.boardState.rollSequence;
  if (rollSequenceDelta === 1) {
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

  const playerIds = sortedIds([
    ...Object.keys(previousGame.players),
    ...Object.keys(nextGame.players),
  ]);
  for (const playerId of playerIds) {
    const oldPlayer = previousGame.players[playerId];
    const newPlayer = nextGame.players[playerId];
    if (!oldPlayer || !newPlayer) continue;

    if (oldPlayer.currentTile !== newPlayer.currentTile) {
      const steps = forwardDistance(oldPlayer.currentTile, newPlayer.currentTile);
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
        presentation: isProvenDiceMovement(
          previous,
          next,
          playerId,
          oldPlayer.currentTile,
          newPlayer.currentTile,
          oldPlayer.isJail,
        ) && steps > 0 && steps <= MAX_WALK ? 'WALK' : 'SNAP',
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
    if (oldPlayer.isJail !== newPlayer.isJail) {
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
    if ((oldProperty?.id ?? null) !== (newProperty?.id ?? null)) {
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

  const finishedIds = sortedIds([
    ...Object.keys(previousGame.boardState.finishedPlayers),
    ...Object.keys(nextGame.boardState.finishedPlayers),
  ]);
  for (const playerId of finishedIds) {
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

  return [
    ...diceEvents,
    ...movementEvents,
    ...landingEvents,
    ...balanceEvents,
    ...ownershipEvents,
    ...developmentEvents,
    ...jailEvents,
    ...finishedEvents,
    ...turnEvents,
    ...gameEvents,
  ];
}

