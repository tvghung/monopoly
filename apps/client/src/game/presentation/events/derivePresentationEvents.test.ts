import { describe, expect, it } from 'vitest';
import { cloneRoom, makeRoom } from '../testFixtures';
import { derivePresentationEvents, semanticEventsSince } from './derivePresentationEvents';

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

  it('attaches one authoritative PASS_GO fact to a proven walk and suppresses duplicate reward events', () => {
    const previous = makeRoom();
    previous.gameState.players['player-a'].currentTile = 39;
    const next = cloneRoom(previous);
    next.gameState.boardState.diceValue = { dice1: 1, dice2: 1 };
    next.gameState.boardState.rollSequence = 1;
    next.gameState.players['player-a'].currentTile = 1;
    next.gameState.players['player-a'].accountBalance = 1700;
    next.gameState.boardState.gameplayEvents = {
      sequence: 2,
      events: [{
        eventId: 'pass-go-1',
        sequence: 1,
        type: 'PASS_GO',
        playerId: 'player-a',
        reward: 200,
        fromTile: 39,
        destinationTile: 1,
        movement: { kind: 'DICE_WALK', rollSequence: 1 },
      }, {
        eventId: 'pass-go-money-1',
        sequence: 2,
        type: 'MONEY_TRANSFER',
        source: { kind: 'BANK' },
        destination: { kind: 'PLAYER', playerId: 'player-a' },
        amount: 200,
        reason: 'PASS_GO',
      }],
    };

    const events = derivePresentationEvents(previous, next);
    expect(events.filter(event => event.type === 'PASS_GO')).toHaveLength(0);
    expect(events.filter(event => event.type === 'MONEY_TRANSFER')).toHaveLength(0);
    expect(events.find(event => event.type === 'MOVE_CHARACTER')).toMatchObject({
      presentation: 'WALK',
      passGo: { eventId: 'pass-go-1', reward: 200 },
    });
  });

  it('carries the authoritative purchase amount into the grouped purchase moment', () => {
    const previous = makeRoom();
    const next = cloneRoom(previous);
    next.gameState.players['player-a'].accountBalance = 1_440;
    next.gameState.boardState.ownedProps[1] = { id: 'player-a', color: 'red', houses: 0 };
    next.gameState.boardState.gameplayEvents = {
      sequence: 2,
      events: [{
        eventId: 'purchase-money',
        sequence: 1,
        operationId: 'purchase-operation',
        type: 'MONEY_TRANSFER',
        source: { kind: 'PLAYER', playerId: 'player-a' },
        destination: { kind: 'BANK' },
        amount: 60,
        reason: 'PROPERTY_PURCHASE',
      }, {
        eventId: 'purchase-property',
        sequence: 2,
        operationId: 'purchase-operation',
        type: 'PROPERTY_TRANSFER',
        tileID: 1,
        from: { kind: 'BANK' },
        to: { kind: 'PLAYER', playerId: 'player-a' },
        cause: 'BANK_PURCHASE',
      }],
    };

    expect(derivePresentationEvents(previous, next).find(event => event.type === 'PROPERTY_TRANSFER'))
      .toMatchObject({
        type: 'PROPERTY_TRANSFER',
        cause: 'BANK_PURCHASE',
        amount: 60,
        transfers: [{
          from: { kind: 'BANK' },
          to: { kind: 'PLAYER', playerId: 'player-a' },
          fromPlayerId: null,
          toPlayerId: 'player-a',
        }],
      });
  });

  it('shows a semantic GO moment for card movement without inventing a walk or duplicate coins', () => {
    const previous = makeRoom();
    previous.gameState.players['player-a'].currentTile = 7;
    const next = cloneRoom(previous);
    next.gameState.players['player-a'].currentTile = 0;
    next.gameState.players['player-a'].accountBalance = 1700;
    next.gameState.boardState.gameplayEvents = {
      sequence: 2,
      events: [{
        eventId: 'card-pass-go',
        sequence: 1,
        operationId: 'card-operation',
        type: 'PASS_GO',
        playerId: 'player-a',
        reward: 200,
        fromTile: 7,
        destinationTile: 0,
        movement: { kind: 'CARD', cardId: 'chance-advance-start' },
      }, {
        eventId: 'card-pass-go-money',
        sequence: 2,
        operationId: 'card-operation',
        type: 'MONEY_TRANSFER',
        source: { kind: 'BANK' },
        destination: { kind: 'PLAYER', playerId: 'player-a' },
        amount: 200,
        reason: 'PASS_GO',
      }],
    };

    const events = derivePresentationEvents(previous, next);
    expect(events.find(event => event.type === 'MOVE_CHARACTER')).toMatchObject({ presentation: 'SNAP' });
    expect(events.filter(event => event.type === 'PASS_GO')).toHaveLength(1);
    expect(events.filter(event => event.type === 'MONEY_TRANSFER')).toHaveLength(0);
  });

  it('uses SENT_TO_JAIL as the only movement authority and never fabricates GO', () => {
    const previous = makeRoom();
    previous.gameState.players['player-a'].currentTile = 30;
    const next = cloneRoom(previous);
    next.gameState.players['player-a'].currentTile = 10;
    next.gameState.players['player-a'].isJail = true;
    next.gameState.boardState.gameplayEvents = {
      sequence: 1,
      events: [{
        eventId: 'jail-1',
        sequence: 1,
        type: 'SENT_TO_JAIL',
        playerId: 'player-a',
        fromTile: 30,
        destinationTile: 10,
        cause: 'BOARD_TILE',
      }],
    };

    const events = derivePresentationEvents(previous, next);
    expect(events.filter(event => event.type === 'MOVE_CHARACTER')).toHaveLength(0);
    expect(events.filter(event => event.type === 'PASS_GO')).toHaveLength(0);
    expect(events.filter(event => event.type === 'SENT_TO_JAIL')).toHaveLength(1);
  });

  it('orders a proven roll to tile 30 before the semantic transfer to jail', () => {
    const previous = makeRoom();
    previous.gameState.players['player-a'].currentTile = 25;
    const next = cloneRoom(previous);
    next.gameState.boardState.diceValue = { dice1: 2, dice2: 3 };
    next.gameState.boardState.rollSequence = 1;
    next.gameState.players['player-a'].currentTile = 10;
    next.gameState.players['player-a'].isJail = true;
    next.gameState.boardState.gameplayEvents = {
      sequence: 1,
      events: [{
        eventId: 'jail-after-roll',
        sequence: 1,
        type: 'SENT_TO_JAIL',
        playerId: 'player-a',
        fromTile: 30,
        destinationTile: 10,
        cause: 'BOARD_TILE',
      }],
    };

    const events = derivePresentationEvents(previous, next);
    expect(events.map(event => event.type)).toEqual([
      'ROLL_DICE', 'MOVE_CHARACTER', 'LAND_TILE', 'SENT_TO_JAIL',
    ]);
    expect(events[1]).toMatchObject({
      type: 'MOVE_CHARACTER', from: 25, to: 30, steps: 5, presentation: 'WALK',
    });
    expect(events[2]).toMatchObject({ type: 'LAND_TILE', tileId: 30 });
    expect(events[3]).toMatchObject({
      type: 'SENT_TO_JAIL',
      event: { fromTile: 30, destinationTile: 10, cause: 'BOARD_TILE' },
    });
    expect(events.some(event => event.type === 'PASS_GO')).toBe(false);
  });

  it('closes the old card before movement and opens a chained card only after LAND', () => {
    const previous = makeRoom();
    previous.gameState.players['player-a'].currentTile = 7;
    previous.gameState.turnInfo.pendingCardInteraction = {
      operationId: 'card-operation-1',
      playerId: 'player-a',
      turnNumber: 1,
      deck: 'chance',
      sourceTile: 7,
      stage: 'REVEALED',
      revealedCardId: 'chance-advance-start',
      continuation: { playerId: 'player-a', turnNumber: 1 },
      deadlineAt: '2026-08-22T00:00:30.000Z',
    };
    const next = cloneRoom(previous);
    next.gameState.players['player-a'].currentTile = 36;
    next.gameState.turnInfo.pendingCardInteraction = {
      operationId: 'card-operation-2',
      playerId: 'player-a',
      turnNumber: 1,
      deck: 'chance',
      sourceTile: 36,
      stage: 'AWAITING_DRAW',
      continuation: { playerId: 'player-a', turnNumber: 1 },
      deadlineAt: '2026-08-22T00:01:00.000Z',
    };

    expect(derivePresentationEvents(previous, next).map(event => (
      event.type === 'CARD_INTERACTION_CHANGED' ? `${event.type}:${event.stage}` : event.type
    ))).toEqual([
      'CARD_INTERACTION_CHANGED:CLOSED',
      'MOVE_CHARACTER',
      'LAND_TILE',
      'CARD_INTERACTION_CHANGED:AWAITING_DRAW',
    ]);
  });

  it('rejects a truncated semantic lane instead of treating a sequence gap as complete history', () => {
    const previous = makeRoom();
    const next = cloneRoom(previous);
    next.gameState.boardState.gameplayEvents = {
      sequence: 3,
      events: [{
        eventId: 'event-3',
        sequence: 3,
        type: 'JAIL_ROLL_FAILED',
        playerId: 'player-a',
      }],
    };
    expect(semanticEventsSince(previous, next)).toBeNull();
  });
});
