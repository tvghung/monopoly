import { describe, expect, it } from 'vitest';
import { freshState } from '../rooms';
import {
  MAX_GAMEPLAY_SEMANTIC_EVENTS,
  recordPrivateGameplayEvent,
  recordPublicGameplayEvent,
} from './semanticEvents';

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
  });
});
