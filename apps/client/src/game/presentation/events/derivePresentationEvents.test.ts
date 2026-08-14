import { describe, expect, it } from 'vitest';
import { cloneRoom, makeRoom } from '../testFixtures';
import { derivePresentationEvents } from './derivePresentationEvents';

describe('derivePresentationEvents', () => {
  it('derives only observable state changes in a deterministic order', () => {
    const previous = makeRoom();
    const next = cloneRoom(previous);
    next.gameState.boardState.diceValue = { dice1: 3, dice2: 4 };
    next.gameState.players['player-a'].currentTile = 4;
    next.gameState.players['player-a'].accountBalance = 1300;
    next.gameState.boardState.ownedProps[4] = {
      id: 'player-a', color: 'red', houses: 2, mortgaged: false,
    };
    next.gameState.boardState.currentPlayer.id = 'player-b';

    const events = derivePresentationEvents(previous, next);
    expect(events.map(event => event.type)).toEqual([
      'ROLL_DICE',
      'MOVE_CHARACTER',
      'LAND_TILE',
      'BALANCE_CHANGED',
      'PROPERTY_OWNERSHIP_CHANGED',
      'TURN_CHANGED',
    ]);
    expect(events[1]).toMatchObject({
      id: 'room-1:revision-2:MOVE_CHARACTER:player-a',
      from: 0,
      to: 4,
      steps: 4,
      presentation: 'WALK',
    });
    expect(events.map(event => event.id)).toEqual(derivePresentationEvents(previous, next).map(event => event.id));
  });

  it('emits development, jail, finish, and game-finished changes without inventing causes', () => {
    const previous = makeRoom();
    previous.gameState.boardState.ownedProps[1] = {
      id: 'player-a', color: 'red', houses: 1, mortgaged: false,
    };
    const next = cloneRoom(previous);
    next.gameState.boardState.ownedProps[1].houses = 5;
    next.gameState.players['player-a'].isJail = true;
    next.gameState.boardState.finishedPlayers['player-b'] = {
      name: 'Bình', color: 'blue', reason: 'BANKRUPT',
    };
    next.gameState.boardState.winner = {
      playerId: 'player-a', name: 'An', color: 'red', reason: 'BANKRUPT',
    };

    expect(derivePresentationEvents(previous, next).map(event => event.type)).toEqual([
      'PROPERTY_DEVELOPMENT_CHANGED',
      'JAIL_STATE_CHANGED',
      'PLAYER_FINISHED',
      'GAME_FINISHED',
    ]);
  });

  it('does not replay stale, duplicate, or cross-room snapshots', () => {
    const previous = makeRoom(4);
    expect(derivePresentationEvents(previous, cloneRoom(previous, 4))).toEqual([]);
    expect(derivePresentationEvents(previous, cloneRoom(previous, 3))).toEqual([]);
    const otherRoom = cloneRoom(previous, 5);
    otherRoom.roomId = 'room-2';
    expect(derivePresentationEvents(previous, otherRoom)).toEqual([]);
  });
});
