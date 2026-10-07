import {
  chanceCards,
  chestCards,
  formatMoney,
  GO_REWARD,
  START_TILE_INDEX,
  type CardDeck,
  type GameCard,
} from '@monopoly/shared';
import { cardVisualFor } from '../game/ui/events/cardVisuals';
import type { CardEffectKind, HowToPlayCard } from './modelTypes';
import type { Language } from '../i18n/I18n';
import { translate } from '../i18n/I18n';
import { getCardPresentation } from '../i18n/cardCopy';

/** The two decks as the players know them. */
export const DECK_NAMES: Readonly<Record<CardDeck, string>> = {
  chance: 'Cơ Hội',
  chest: 'Khí Vận',
};

export function getDeckName(deck: CardDeck, language: Language): string {
  return translate(deck === 'chance' ? 'board.chance' : 'board.communityChest', language);
}

const DECK_CARDS: Readonly<Record<CardDeck, readonly GameCard[]>> = {
  chance: chanceCards,
  chest: chestCards,
};

const KIND_ORDER: readonly CardEffectKind[] = ['gain', 'pay', 'move', 'jail', 'keep'];

/** The main thing a card does, read from its typed effects (the same fields the server applies). */
export function classifyCard(card: GameCard): CardEffectKind {
  if (card.getOutOfJailFree) return 'keep';
  if (card.goToJail) return 'jail';
  if (typeof card.moveToTile === 'number' || typeof card.moveBy === 'number') return 'move';
  if (card.penalty || card.payEachPlayer) return 'pay';
  if (card.reward || card.collectFromEachPlayer) return 'gain';
  throw new RangeError(`Thẻ ${card.id} không có hiệu lực nào để mô tả.`);
}

/**
 * What the printed message leaves out: whether Xuất Phát pays, who pays whom, what happens after a move. Plain money cards
 * need nothing more because their message already names the amount.
 */
export function describeCardNote(card: GameCard, language: Language = 'vi'): string | undefined {
  const t = (key: Parameters<typeof translate>[0], values?: Readonly<Record<string, string | number>>) => translate(key, language, values);
  if (card.getOutOfJailFree) {
    return t('guide.note.keep');
  }
  if (card.goToJail) return t('guide.note.jail');
  if (card.moveToTile === START_TILE_INDEX) return t('guide.note.start', { amount: formatMoney(GO_REWARD) });
  if (typeof card.moveToTile === 'number' || (typeof card.moveBy === 'number' && card.moveBy > 0)) {
    return t('guide.note.passStart', { amount: formatMoney(GO_REWARD) });
  }
  if (typeof card.moveBy === 'number') {
    return t('guide.note.back');
  }
  if (card.payEachPlayer) return t('guide.note.payEach');
  if (card.collectFromEachPlayer) return t('guide.note.collectEach');
  return undefined;
}

/** Every card of a deck, in the order of the shared data (the draw order is shuffled on the server and never shown). */
export function buildCardList(deck: CardDeck, language: Language = 'vi'): HowToPlayCard[] {
  return DECK_CARDS[deck].map((card) => {
    const kind = classifyCard(card);
    const note = describeCardNote(card, language);
    const copy = getCardPresentation(card.id, language);
    return {
      id: card.id,
      title: cardVisualFor(card.id, language)?.title ?? copy.title,
      message: copy.message,
      kind,
      kindLabel: translate(`guide.kind.${kind}`, language),
      ...(note ? { note } : {}),
    };
  });
}

/** One sentence that counts a deck by kind, for example "Bộ Cơ Hội có 13 thẻ: 2 thẻ nhận tiền, 4 thẻ phải trả tiền, …". */
export function summarizeDeck(deck: CardDeck, cards: readonly HowToPlayCard[], language: Language = 'vi'): string {
  const parts = KIND_ORDER
    .map((kind) => ({ kind, count: cards.filter((card) => card.kind === kind).length }))
    .filter(({ count }) => count > 0)
    .map(({ kind, count }) => `${count} ${translate(`guide.kindCount.${kind}`, language)}`);
  return translate('guide.deckSummary', language, {
    deck: getDeckName(deck, language),
    total: cards.length,
    parts: parts.join(', '),
  });
}
