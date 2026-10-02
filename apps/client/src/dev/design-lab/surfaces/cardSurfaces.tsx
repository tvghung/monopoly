import type { CardDeck, GameCardId } from '@monopoly/shared';
import { emptyPresentationState, presentationContext } from '../../../game/presentation/PresentationProvider';
import type { AnimationQueue } from '../../../game/presentation/queue/AnimationQueue';
import CardInteractionOverlay from '../../../game/ui/events/CardInteractionOverlay';
import { withState, type SurfaceFixture } from './surfaceKit';

const OPERATION_ID = 'card-operation-1';

/**
 * A revealed card on its way to `player-a`, seen by `viewerId`. The presentation signal that the overlay waits for is
 * injected next to the state, because the surface provider only supplies an idle presentation without one.
 */
function revealedCard(deck: CardDeck, cardId: GameCardId, sourceTile: number, viewerId: string) {
  return withState({
    playerId: viewerId,
    mutate: room => {
      room.gameState.players['player-a'].currentTile = sourceTile;
      room.gameState.turnInfo.pendingCardInteraction = {
        operationId: OPERATION_ID,
        playerId: 'player-a',
        turnNumber: 1,
        deck,
        sourceTile,
        stage: 'REVEALED',
        revealedCardId: cardId,
        continuation: { playerId: 'player-a', turnNumber: 1 },
        deadlineAt: '2030-01-01T00:00:30.000Z',
      };
    },
  }, (
    <presentationContext.Provider
      value={{
        state: {
          ...emptyPresentationState,
          status: 'idle',
          cardPresentation: {
            operationId: OPERATION_ID,
            playerId: 'player-a',
            deck,
            sourceTile,
            stage: 'REVEALED',
            revealedCardId: cardId,
            durationMs: 0,
          },
        },
        queue: null as unknown as AnimationQueue,
      }}
    >
      <CardInteractionOverlay />
    </presentationContext.Provider>
  ));
}

/** The Chance / Khí Vận card reveal (plan 04 T04.8). */
export const CARD_SURFACES: readonly SurfaceFixture[] = [
  {
    id: 'card-chance',
    label: 'Card reveal, Cơ Hội (acting player)',
    group: 'Card',
    render: () => revealedCard('chance', 'chance-dividend', 7, 'player-a'),
  },
  {
    id: 'card-chest',
    label: 'Card reveal, Khí Vận (acting player)',
    group: 'Card',
    render: () => revealedCard('chest', 'chest-inheritance', 2, 'player-a'),
  },
  {
    id: 'card-waiting',
    label: 'Card reveal, waiting for the acting player',
    group: 'Card',
    render: () => revealedCard('chance', 'chance-community-event', 7, 'player-b'),
  },
];
