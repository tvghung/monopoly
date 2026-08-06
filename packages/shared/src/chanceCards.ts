import type { GameCard } from './types';

// Chance deck, adapted from the classic Monopoly cards to this board's tile
// layout. Tile references: 0 = GO, 5 = Reading Railroad, 10 = Jail,
// 24 = Albany Lane, 39 = Meadowlands Avenue.
const chanceCards: GameCard[] = [
  {
    message: 'Advance to GO and collect $200M.',
    moveToTile: 0,
    reward: 200,
  },
  {
    message: 'Advance to Meadowlands Avenue.',
    moveToTile: 39,
  },
  {
    message: 'Advance to Albany Lane.',
    moveToTile: 24,
  },
  {
    message: 'Take a trip to Reading Railroad.',
    moveToTile: 5,
  },
  {
    message: 'Go back 3 spaces.',
    moveBy: -3,
  },
  {
    message: 'Go directly to jail. Do not pass GO, do not collect $200M.',
    goToJail: true,
  },
  {
    message: 'Make general repairs on all your property. Pay $75M.',
    penalty: 75,
  },
  {
    message: 'Speeding fine. Pay $15M.',
    penalty: 15,
  },
  {
    message: 'You have been elected chairman of the board. Pay each player $50M.',
    payEachPlayer: 50,
  },
  {
    message: 'Your building loan matures. Collect $150M.',
    reward: 150,
  },
  {
    message: 'The bank pays you a dividend of $50M.',
    reward: 50,
  },
  {
    message: 'Pay a poor tax of $15M.',
    penalty: 15,
  },
  {
    message: 'Get out of jail free. Keep this card until needed.',
    getOutOfJailFree: true,
  },
];

export default chanceCards;
