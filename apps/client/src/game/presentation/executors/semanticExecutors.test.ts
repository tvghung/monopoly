import { describe, expect, it } from 'vitest';
import type {
  CardInteractionChangedPresentationEvent,
  PropertyTransferPresentationEvent,
} from '../events/types';
import type { AnimationExecutionContext, PresentationExecutor } from '../queue/types';
import { PresentationStore } from '../store/presentationStore';
import { makeRoom } from '../testFixtures';
import { createSemanticExecutors } from './semanticExecutors';

const immediateContext: AnimationExecutionContext = {
  signal: new AbortController().signal,
  speedMultiplier: 1,
  reducedMotion: false,
  getDuration: duration => duration,
  wait: async () => {},
  waitForDuration: async () => {},
};

function cardEvent(
  stage: 'AWAITING_DRAW' | 'REVEALED',
): CardInteractionChangedPresentationEvent {
  return {
    id: `card:${stage}`,
    roomId: 'room-1',
    roomVersion: 2,
    type: 'CARD_INTERACTION_CHANGED',
    entityId: 'operation',
    operationId: 'operation',
    playerId: 'player-a',
    deck: 'chance',
    sourceTile: 7,
    stage,
    ...(stage === 'REVEALED' ? { revealedCardId: 'chance-dividend' as const } : {}),
  };
}

describe('semantic presentation executors', () => {
  it('publishes a revealed card immediately and clears it only on close', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createSemanticExecutors(store).CARD_INTERACTION_CHANGED as unknown as
      PresentationExecutor<CardInteractionChangedPresentationEvent>;

    await executor.run(cardEvent('AWAITING_DRAW'), immediateContext);
    expect(store.getSnapshot().cardPresentation).toMatchObject({
      stage: 'AWAITING_DRAW', durationMs: 0,
    });
    await executor.run(cardEvent('REVEALED'), immediateContext);
    expect(store.getSnapshot().cardPresentation).toMatchObject({
      stage: 'REVEALED',
      revealedCardId: 'chance-dividend',
      durationMs: 0,
    });
  });

  it('keeps property transfer feedback physical and removes informational stages', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createSemanticExecutors(store).PROPERTY_TRANSFER as unknown as
      PresentationExecutor<PropertyTransferPresentationEvent>;
    const event: PropertyTransferPresentationEvent = {
      id: 'property-sale',
      roomId: 'room-1',
      roomVersion: 2,
      type: 'PROPERTY_TRANSFER',
      entityId: 'sale-operation',
      cause: 'BANKRUPTCY',
      transfers: [{
        eventId: 'property-sale:1',
        tileId: 1,
        from: { kind: 'PLAYER', playerId: 'player-a' },
        to: { kind: 'BANK' },
        fromPlayerId: 'player-a',
        toPlayerId: null,
      }],
    };

    await executor.run(event, immediateContext);

    expect(store.getSnapshot().ownershipChanges).toMatchObject([{
      tileId: 1,
      fromPlayerId: 'player-a',
      toPlayerId: null,
    }]);
  });
});
