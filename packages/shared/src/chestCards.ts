import type { GameCard } from './types';

// Community Chest deck, adapted from the classic Monopoly cards to this board's
// tile layout and "$X M" money style.
const chestCards: GameCard[] = [
  {
    message: 'Advance to GO and collect $200M.',
    moveToTile: 0,
    reward: 200,
  },
  {
    message: 'Bank error in your favour. Collect $200M.',
    reward: 200,
  },
  {
    message: "Doctor's fees. Pay $50M.",
    penalty: 50,
  },
  {
    message: 'From the sale of stock you get $50M.',
    reward: 50,
  },
  {
    message: 'Go directly to jail. Do not pass GO, do not collect $200M.',
    goToJail: true,
  },
  {
    message: 'Your holiday fund matures. Receive $100M.',
    reward: 100,
  },
  {
    message: 'Income tax refund. Collect $20M.',
    reward: 20,
  },
  {
    message: 'It is your birthday. Collect $10M from every player.',
    collectFromEachPlayer: 10,
  },
  {
    message: 'Life insurance matures. Collect $100M.',
    reward: 100,
  },
  {
    message: 'Pay hospital fees of $100M.',
    penalty: 100,
  },
  {
    message: 'Pay school fees of $50M.',
    penalty: 50,
  },
  {
    message: 'Receive $25M consultancy fee.',
    reward: 25,
  },
  {
    message: 'You have won second prize in a beauty contest. Collect $10M.',
    reward: 10,
  },
  {
    message: 'You inherit $100M.',
    reward: 100,
  },
  {
    message: 'Get out of jail free. Keep this card until needed.',
    getOutOfJailFree: true,
  },
];

export default chestCards;
