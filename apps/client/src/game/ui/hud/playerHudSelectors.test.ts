import { describe, expect, it } from 'vitest';
import { makeRoom } from '../../presentation/testFixtures';
import { selectPlayerHudViewModels } from './playerHudSelectors';

describe('selectPlayerHudViewModels', () => {
  it('derives canonical property and development counts plus lifecycle flags', () => {
    const room = makeRoom();
    room.gameState.boardState.ownedProps = {
      1: { id: 'player-a', color: 'red', houses: 2, mortgaged: false },
      3: { id: 'player-a', color: 'red', houses: 5, mortgaged: false },
    };
    room.gameState.boardState.finishedPlayers['player-b'] = {
      name: 'Bình', color: 'blue', reason: 'LEFT',
    };
    const views = selectPlayerHudViewModels(room.gameState, 'player-a', room.players);
    expect(views[0]).toMatchObject({
      playerId: 'player-a',
      propertyCount: 2,
      houseCount: 2,
      hotelCount: 1,
      characterId: null,
      isCurrentTurn: true,
    });
    expect(views.find(view => view.playerId === 'player-b')).toMatchObject({
      hasLeft: true,
      isConnected: false,
    });
  });
});
