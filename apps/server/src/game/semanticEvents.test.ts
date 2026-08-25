import { describe, expect, it } from 'vitest';
import { freshState } from '../rooms';
import { MAX_ACTIVITY_FEED_EVENTS, recordActivityEvent } from './activity';
import { sellHouse } from './property';
import {
  MAX_GAMEPLAY_SEMANTIC_EVENTS,
  recordPrivateGameplayEvent,
  recordPublicGameplayEvent,
} from './semanticEvents';
import { transferProperty } from './transfer';

describe('durable semantic gameplay event lanes', () => {
  it('assigns monotonic sequence numbers while retaining only the bounded tail', () => {
    const state = freshState();
    for (let index = 0; index < MAX_GAMEPLAY_SEMANTIC_EVENTS + 3; index += 1) {
      recordPublicGameplayEvent(state, {
        type: 'JAIL_ROLL_FAILED',
        playerId: 'player-a',
      });
    }

    const stream = state.boardState.gameplayEvents;
    expect(stream.sequence).toBe(MAX_GAMEPLAY_SEMANTIC_EVENTS + 3);
    expect(stream.events).toHaveLength(MAX_GAMEPLAY_SEMANTIC_EVENTS);
    expect(stream.events[0]?.sequence).toBe(4);
    expect(stream.events.at(-1)?.sequence).toBe(MAX_GAMEPLAY_SEMANTIC_EVENTS + 3);
    expect(new Set(stream.events.map(event => event.eventId)).size).toBe(stream.events.length);
  });

  it('uses one fact id for authorized private viewers while each lane advances independently', () => {
    const state = freshState();
    recordPrivateGameplayEvent(state, ['buyer', 'seller', 'buyer'], {
      type: 'MONEY_TRANSFER',
      source: { kind: 'PLAYER', playerId: 'buyer' },
      destination: { kind: 'PLAYER', playerId: 'seller' },
      amount: 70,
      reason: 'FORCED_SALE',
      operationId: 'sale-operation',
    });

    const buyer = state.privateState.privateGameplayEventsByPlayer.buyer;
    const seller = state.privateState.privateGameplayEventsByPlayer.seller;
    expect(buyer).toMatchObject({ sequence: 1, events: [{ sequence: 1, amount: 70 }] });
    expect(seller).toMatchObject({ sequence: 1, events: [{ sequence: 1, amount: 70 }] });
    expect(buyer.events[0]?.eventId).toBe(seller.events[0]?.eventId);
    expect(state.boardState.gameplayEvents.events).toEqual([]);
    expect(state.boardState.activityFeed.events).toEqual([]);
  });

  it('records standalone public money facts in a bounded structured activity tail', () => {
    const state = freshState();
    state.players['buyer'] = {
      name: 'Buyer',
      currentTile: 0,
      color: 'red',
      characterId: 'dog',
      accountBalance: 1_000,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    };
    recordPublicGameplayEvent(state, {
      type: 'MONEY_TRANSFER',
      source: { kind: 'PLAYER', playerId: 'buyer' },
      destination: { kind: 'BANK' },
      amount: 200,
      reason: 'RENT',
    });
    expect(state.boardState.activityFeed.events.at(-1)).toMatchObject({
      sequence: 1,
      type: 'MONEY_TRANSFER',
      source: { kind: 'PLAYER', playerId: 'buyer', name: 'Buyer' },
      destination: { kind: 'BANK' },
      amount: 200,
    });

    for (let index = 0; index < MAX_ACTIVITY_FEED_EVENTS + 2; index += 1) {
      recordActivityEvent(state, { type: 'GAME_STARTED', playerIds: ['buyer', 'seller'], startingPlayerId: 'buyer', startingPlayerName: 'Buyer' });
    }
    expect(state.boardState.activityFeed.events).toHaveLength(MAX_ACTIVITY_FEED_EVENTS);
    expect(state.boardState.activityFeed.events.at(-1)?.sequence)
      .toBe(MAX_ACTIVITY_FEED_EVENTS + 3);
  });

  it('keeps purchase and property-development narration to one primary activity each', () => {
    const state = freshState();
    state.players.buyer = {
      name: 'Buyer',
      currentTile: 0,
      color: 'red',
      characterId: 'dog',
      accountBalance: 1_500,
      isJail: false,
      jailOpponentRoundsElapsed: 0,
      heldJailFreeCardIds: [],
    };

    recordPublicGameplayEvent(state, {
      type: 'MONEY_TRANSFER',
      source: { kind: 'PLAYER', playerId: 'buyer' },
      destination: { kind: 'BANK' },
      amount: 60,
      reason: 'PROPERTY_PURCHASE',
      operationId: 'purchase-operation',
    });
    expect(transferProperty(state, 1, null, 'buyer', 'BANK_PURCHASE', {
      operationId: 'purchase-operation',
    }).ok).toBe(true);
    expect(state.boardState.activityFeed.events.map(event => event.type)).toEqual(['PROPERTY_PURCHASE']);

    state.boardState.ownedProps[1].houses = 2;
    expect(sellHouse(state, 'buyer', 1)).toBe(true);
    expect(state.boardState.activityFeed.events.map(event => event.type)).toEqual([
      'PROPERTY_PURCHASE',
      'PROPERTY_DEVELOPMENT',
    ]);
    expect(state.boardState.activityFeed.events.at(-1)).toMatchObject({
      type: 'PROPERTY_DEVELOPMENT',
      action: 'SELL',
      fromHouses: 2,
      toHouses: 1,
    });
  });
});
