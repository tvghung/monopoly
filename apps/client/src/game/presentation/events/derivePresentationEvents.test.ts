import { describe, expect, it } from 'vitest';
import { cloneRoom, makeRoom } from '../testFixtures';
import { derivePresentationEvents } from './derivePresentationEvents';

describe('derivePresentationEvents', () => {
  it('derives only observable state changes in a deterministic order', () => {
    const previous = makeRoom();
    const next = cloneRoom(previous);
    next.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
    next.gameState.boardState.rollSequence = 1;
    next.gameState.players['player-a'].currentTile = 4;
    next.gameState.players['player-a'].accountBalance = 1300;
    next.gameState.boardState.ownedProps[4] = {
      id: 'player-a', color: 'red', houses: 2,
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
    expect(events[0]).toMatchObject({
      id: 'room-1:roll-1',
      rollSequence: 1,
    });
    expect(events.map(event => event.id)).toEqual(derivePresentationEvents(previous, next).map(event => event.id));
  });

  it('emits development, jail, finish, and game-finished changes without inventing causes', () => {
    const previous = makeRoom();
    previous.gameState.boardState.ownedProps[1] = {
      id: 'player-a', color: 'red', houses: 1,
    };
    const next = cloneRoom(previous);
    next.gameState.boardState.ownedProps[1].houses = 5;
    next.gameState.players['player-a'].isJail = true;
    next.gameState.boardState.finishedPlayers['player-b'] = {
      name: 'Bình', color: 'blue', characterId: 'panda', reason: 'BANKRUPT',
    };
    next.gameState.boardState.winner = {
      playerId: 'player-a', name: 'An', color: 'red', characterId: 'dog', reason: 'BANKRUPT',
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

  it('uses roll sequence identity instead of dice faces', () => {
    const previous = makeRoom();
    const identicalFaces = cloneRoom(previous);
    identicalFaces.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
    identicalFaces.gameState.boardState.rollSequence = 1;
    expect(derivePresentationEvents(previous, identicalFaces)).toMatchObject([
      { type: 'ROLL_DICE', rollSequence: 1, dice1: 2, dice2: 2 },
    ]);

    const faceOnlyChange = cloneRoom(previous);
    faceOnlyChange.gameState.boardState.diceValue = { dice1: 3, dice2: 4 };
    expect(derivePresentationEvents(previous, faceOnlyChange)).toEqual([]);

    const duplicateSequence = cloneRoom(identicalFaces);
    duplicateSequence.gameState.boardState.diceValue = { dice1: 5, dice2: 6 };
    expect(derivePresentationEvents(identicalFaces, duplicateSequence)).toEqual([]);
  });

  it('walks only when one accepted roll proves the destination, including board wrap', () => {
    const previous = makeRoom();
    const rolled = cloneRoom(previous);
    rolled.gameState.boardState.diceValue = { dice1: 3, dice2: 4 };
    rolled.gameState.boardState.rollSequence = 1;
    rolled.gameState.players['player-a'].currentTile = 7;
    expect(derivePresentationEvents(previous, rolled)).toMatchObject([
      { type: 'ROLL_DICE', rollSequence: 1 },
      { type: 'MOVE_CHARACTER', from: 0, to: 7, steps: 7, presentation: 'WALK' },
      { type: 'LAND_TILE', tileId: 7 },
    ]);

    const wrapPrevious = cloneRoom(previous);
    wrapPrevious.gameState.players['player-a'].currentTile = 39;
    const wrapped = cloneRoom(wrapPrevious);
    wrapped.gameState.boardState.diceValue = { dice1: 1, dice2: 1 };
    wrapped.gameState.boardState.rollSequence = wrapPrevious.gameState.boardState.rollSequence + 1;
    wrapped.gameState.players['player-a'].currentTile = 1;
    expect(derivePresentationEvents(wrapPrevious, wrapped).slice(0, 2)).toMatchObject([
      { type: 'ROLL_DICE', rollSequence: 1 },
      { type: 'MOVE_CHARACTER', from: 39, to: 1, steps: 2, presentation: 'WALK' },
    ]);
  });

  it('snaps ambiguous, skipped, and non-roll relocations', () => {
    const previous = makeRoom();
    const gap = cloneRoom(previous);
    gap.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
    gap.gameState.boardState.rollSequence = 2;
    gap.gameState.players['player-a'].currentTile = 4;
    const gapEvents = derivePresentationEvents(previous, gap);
    expect(gapEvents.find(event => event.type === 'MOVE_CHARACTER')).toMatchObject({
      type: 'MOVE_CHARACTER', presentation: 'SNAP',
    });
    expect(gapEvents.some(event => event.type === 'ROLL_DICE')).toBe(false);

    const relocated = cloneRoom(previous);
    relocated.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
    relocated.gameState.boardState.rollSequence = 1;
    relocated.gameState.players['player-a'].currentTile = 3;
    const relocatedEvents = derivePresentationEvents(previous, relocated);
    expect(relocatedEvents.find(event => event.type === 'ROLL_DICE')).toMatchObject({
      type: 'ROLL_DICE', rollSequence: 1,
    });
    expect(relocatedEvents.find(event => event.type === 'MOVE_CHARACTER')).toMatchObject({
      type: 'MOVE_CHARACTER', presentation: 'SNAP',
    });

    const nonRoll = cloneRoom(previous);
    nonRoll.gameState.players['player-a'].currentTile = 1;
    expect(derivePresentationEvents(previous, nonRoll).find(event => event.type === 'MOVE_CHARACTER')).toMatchObject({
      type: 'MOVE_CHARACTER', presentation: 'SNAP',
    });
  });

  it('does not invent movement for a failed jail roll but walks after a successful double', () => {
    const previous = makeRoom();
    previous.gameState.players['player-a'].currentTile = 10;
    previous.gameState.players['player-a'].isJail = true;

    const failed = cloneRoom(previous);
    failed.gameState.boardState.diceValue = { dice1: 2, dice2: 4 };
    failed.gameState.boardState.rollSequence = 1;
    expect(derivePresentationEvents(previous, failed).some(event => event.type === 'MOVE_CHARACTER')).toBe(false);

    const successful = cloneRoom(previous);
    successful.gameState.boardState.diceValue = { dice1: 2, dice2: 2 };
    successful.gameState.boardState.rollSequence = 1;
    successful.gameState.players['player-a'].currentTile = 14;
    successful.gameState.players['player-a'].isJail = false;
    const successfulEvents = derivePresentationEvents(previous, successful);
    expect(successfulEvents.slice(0, 2)).toMatchObject([
      { type: 'ROLL_DICE', rollSequence: 1 },
      { type: 'MOVE_CHARACTER', from: 10, to: 14, presentation: 'WALK' },
    ]);
  });
});
