import { describe, expect, it } from 'vitest';
import { makeRoom } from '../../presentation/testFixtures';
import { buildPortfolioModel } from './portfolioModel';

type Owned = Record<number, { id: string; color: 'red' | 'blue'; houses: number }>;

function modelFor(ownerId: string, ownedProps: Owned) {
  const room = makeRoom();
  room.gameState.boardState.ownedProps = ownedProps;
  return buildPortfolioModel(room.gameState, ownerId, 'v2');
}

describe('buildPortfolioModel', () => {
  it('is empty for a player who owns nothing, such as one who went bankrupt or left', () => {
    const model = modelFor('player-a', { 1: { id: 'player-b', color: 'blue', houses: 0 } });
    expect(model).toEqual({ groups: [], properties: 0, houses: 0, hotels: 0 });
  });

  it('groups owned tiles by district in board order, streets first, then railroads and utilities', () => {
    const model = modelFor('player-a', {
      28: { id: 'player-a', color: 'red', houses: 0 },
      15: { id: 'player-a', color: 'red', houses: 0 },
      8: { id: 'player-a', color: 'red', houses: 1 },
      1: { id: 'player-a', color: 'red', houses: 2 },
      6: { id: 'player-a', color: 'red', houses: 0 },
      5: { id: 'player-a', color: 'red', houses: 0 },
    });
    expect(model.groups.map(group => group.key)).toEqual(['brown', 'lightblue', 'railroad', 'utility']);
    expect(model.groups.map(group => group.tileIds)).toEqual([[1], [6, 8], [5, 15], [28]]);
    expect(model.groups.map(group => group.label)).toEqual(['Nâu', 'Xanh nhạt', 'Ga tàu', 'Tiện ích']);
    expect(model.properties).toBe(6);
  });

  it('ignores tiles that belong to other players', () => {
    const model = modelFor('player-a', {
      1: { id: 'player-a', color: 'red', houses: 0 },
      3: { id: 'player-b', color: 'blue', houses: 4 },
    });
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].tileIds).toEqual([1]);
    expect(model.groups[0].total).toBe(2);
    expect(model.groups[0].complete).toBe(false);
    expect(model.houses).toBe(0);
  });

  it('counts houses as levels 1 to 4 and a hotel as level 5', () => {
    const model = modelFor('player-a', {
      1: { id: 'player-a', color: 'red', houses: 3 },
      3: { id: 'player-a', color: 'red', houses: 5 },
      37: { id: 'player-a', color: 'red', houses: 2 },
    });
    expect(model.houses).toBe(5);
    expect(model.hotels).toBe(1);
  });

  it('marks a street district complete only when the player holds every tile of it', () => {
    const model = modelFor('player-a', {
      1: { id: 'player-a', color: 'red', houses: 0 },
      3: { id: 'player-a', color: 'red', houses: 0 },
      5: { id: 'player-a', color: 'red', houses: 0 },
      15: { id: 'player-a', color: 'red', houses: 0 },
      25: { id: 'player-a', color: 'red', houses: 0 },
      35: { id: 'player-a', color: 'red', houses: 0 },
    });
    const byKey = Object.fromEntries(model.groups.map(group => [group.key, group]));
    expect(byKey.brown.complete).toBe(true);
    // Four railroads are a full set but not a street district: the rule note and the crown are for streets.
    expect(byKey.railroad.tileIds).toHaveLength(4);
    expect(byKey.railroad.complete).toBe(false);
  });
});
