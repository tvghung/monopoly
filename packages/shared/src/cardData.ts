import chanceCards from './chanceCards';
import chestCards from './chestCards';
import type { GameCard, GameCardId, GameDecks } from './types';

export const allGameCards: GameCard[] = [...chanceCards, ...chestCards];

export const gameCardsById: Readonly<Record<GameCardId, GameCard>> = Object.freeze(
  Object.fromEntries(allGameCards.map((card) => [card.id, card])),
);

/** Return fresh canonical piles for the server to shuffle when a game starts. */
export const createCanonicalDecks = (): GameDecks => ({
  chance: { drawPile: chanceCards.map((card) => card.id) },
  chest: { drawPile: chestCards.map((card) => card.id) },
});
