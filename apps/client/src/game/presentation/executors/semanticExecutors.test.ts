import { describe, expect, it } from 'vitest';
import type {
  CardInteractionChangedPresentationEvent,
  PropertyTransferPresentationEvent,
} from '../events/types';
import type { AnimationExecutionContext, PresentationExecutor } from '../queue/types';
import { PresentationStore } from '../store/presentationStore';
import { makeRoom } from '../testFixtures';
import { presentationTiming } from '../timings';
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
  it('publishes face-down flight, settled click, reveal spin, and final revealed stages', async () => {
    const store = new PresentationStore();
    store.resetFromSnapshot(makeRoom());
    const executor = createSemanticExecutors(store).CARD_INTERACTION_CHANGED as unknown as
      PresentationExecutor<CardInteractionChangedPresentationEvent>;

    let releaseDraw = () => {};
    const drawWait = new Promise<void>(resolve => { releaseDraw = resolve; });
    const drawing = executor.run(cardEvent('AWAITING_DRAW'), {
      ...immediateContext,
      waitForDuration: duration => {
        expect(duration).toBe(presentationTiming.cardDraw);
        return drawWait;
      },
    });
    expect(store.getSnapshot().cardPresentation).toMatchObject({
      stage: 'DRAWING', durationMs: presentationTiming.cardDraw,
    });
    releaseDraw();
    await drawing;
    expect(store.getSnapshot().cardPresentation).toMatchObject({
      stage: 'AWAITING_DRAW', durationMs: 0,
    });

    let releaseReveal = () => {};
    const revealWait = new Promise<void>(resolve => { releaseReveal = resolve; });
    const revealing = executor.run(cardEvent('REVEALED'), {
      ...immediateContext,
      waitForDuration: duration => {
        expect(duration).toBe(presentationTiming.cardReveal);
        return revealWait;
      },
    });
    expect(store.getSnapshot().cardPresentation).toMatchObject({
      stage: 'REVEALING',
      revealedCardId: 'chance-dividend',
      durationMs: presentationTiming.cardReveal,
    });
    releaseReveal();
    await revealing;
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
