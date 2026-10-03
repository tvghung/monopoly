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

/** The two decks as the players know them. */
export const DECK_NAMES: Readonly<Record<CardDeck, string>> = {
  chance: 'Cơ Hội',
  chest: 'Khí Vận',
};

const DECK_CARDS: Readonly<Record<CardDeck, readonly GameCard[]>> = {
  chance: chanceCards,
  chest: chestCards,
};

const KIND_LABELS: Readonly<Record<CardEffectKind, string>> = {
  gain: 'Nhận tiền',
  pay: 'Trả tiền',
  move: 'Di chuyển',
  jail: 'Vào tù',
  keep: 'Giữ lại',
};

/** How a count of one kind reads inside the sentence that sums a deck up. */
const KIND_COUNT_WORDS: Readonly<Record<CardEffectKind, string>> = {
  gain: 'thẻ nhận tiền',
  pay: 'thẻ phải trả tiền',
  move: 'thẻ di chuyển',
  jail: 'thẻ vào tù',
  keep: 'thẻ Thoát Tù Miễn Phí',
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
export function describeCardNote(card: GameCard): string | undefined {
  if (card.getOutOfJailFree) {
    return 'Giữ thẻ cho đến khi dùng. Dùng xong, thẻ quay về bộ bài. Bạn có thể đưa thẻ vào giao dịch.';
  }
  if (card.goToJail) return 'Đi thẳng vào Nhà Tù, không nhận tiền Xuất Phát. Lượt của bạn kết thúc.';
  if (card.moveToTile === START_TILE_INDEX) return `Về tới Xuất Phát, bạn nhận ${formatMoney(GO_REWARD)}.`;
  if (typeof card.moveToTile === 'number' || (typeof card.moveBy === 'number' && card.moveBy > 0)) {
    return `Nếu đường đi qua Xuất Phát, bạn nhận ${formatMoney(GO_REWARD)}. Sau đó bạn làm theo ô mới như bình thường.`;
  }
  if (typeof card.moveBy === 'number') {
    return 'Lùi lại không nhận tiền Xuất Phát. Bạn làm theo ô mới như bình thường.';
  }
  if (card.payEachPlayer) return 'Bạn trả số tiền này cho từng người chơi khác.';
  if (card.collectFromEachPlayer) return 'Mỗi người chơi khác trả số tiền này cho bạn.';
  return undefined;
}

/** Every card of a deck, in the order of the shared data (the draw order is shuffled on the server and never shown). */
export function buildCardList(deck: CardDeck): HowToPlayCard[] {
  return DECK_CARDS[deck].map((card) => {
    const kind = classifyCard(card);
    const note = describeCardNote(card);
    return {
      id: card.id,
      title: cardVisualFor(card.id)?.title ?? card.message,
      message: card.message,
      kind,
      kindLabel: KIND_LABELS[kind],
      ...(note ? { note } : {}),
    };
  });
}

/** One sentence that counts a deck by kind, for example "Bộ Cơ Hội có 13 thẻ: 2 thẻ nhận tiền, 4 thẻ phải trả tiền, …". */
export function summarizeDeck(deck: CardDeck, cards: readonly HowToPlayCard[]): string {
  const parts = KIND_ORDER
    .map((kind) => ({ kind, count: cards.filter((card) => card.kind === kind).length }))
    .filter(({ count }) => count > 0)
    .map(({ kind, count }) => `${count} ${KIND_COUNT_WORDS[kind]}`);
  return `Bộ ${DECK_NAMES[deck]} có ${cards.length} thẻ: ${parts.join(', ')}.`;
}
