import type { PublicGameState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { getWinnerSummary } from './WinnerBanner';

describe('getWinnerSummary', () => {
  it('counts each hotel as one hotel and zero houses', () => {
    const state = {
      boardState: {
        winner: {
          playerId: 'winner',
          name: 'Ada',
          color: 'red',
          characterId: null,
          accountBalance: 900,
        },
        ownedProps: {
          1: { id: 'winner', color: 'red', houses: 2 },
          3: { id: 'winner', color: 'red', houses: 5 },
          6: { id: 'other', color: 'blue', houses: 4 },
        },
      },
      players: { winner: { accountBalance: 1_200 } },
    } as unknown as PublicGameState;

    expect(getWinnerSummary(state)).toEqual({
      finalCash: 1_200,
      propertyCount: 2,
      houseCount: 2,
      hotelCount: 1,
    });
  });
});
