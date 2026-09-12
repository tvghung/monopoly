import { allGameCards } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { cardVisualFor, cardVisuals } from './cardVisuals';

describe('card visual manifest', () => {
  it('has exactly one correctly-decked visual for every authoritative card', () => {
    const cardIds = allGameCards.map(card => card.id).sort();
    expect(Object.keys(cardVisuals).sort()).toEqual(cardIds);
    for (const card of allGameCards) {
      const definition = cardVisualFor(card.id);
      expect(definition?.deck).toBe(card.sourceDeck);
      expect(definition?.artworkUrl).toContain(`/art/cards/${card.sourceDeck}/${card.id}.svg`);
    }
  });
});
