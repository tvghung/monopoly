import { randomInt } from 'node:crypto';
import { createCanonicalDecks, type GameDecks } from '@monopoly/shared';

export type RandomIndex = (upperExclusive: number) => number;

const cryptoIndex: RandomIndex = (upperExclusive) => randomInt(upperExclusive);

export const shuffleInPlace = <T>(values: T[], randomIndex: RandomIndex = cryptoIndex): T[] => {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1);
    if (!Number.isInteger(other) || other < 0 || other > index) {
      throw new RangeError('Nguồn ngẫu nhiên trả về chỉ số không hợp lệ.');
    }
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
};

/** Fresh durable piles are shuffled exactly once by the committed start command. */
export const createShuffledDecks = (randomIndex: RandomIndex = cryptoIndex): GameDecks => {
  const decks = createCanonicalDecks();
  shuffleInPlace(decks.chance.drawPile, randomIndex);
  shuffleInPlace(decks.chest.drawPile, randomIndex);
  return decks;
};
