import { describe, expect, it } from 'vitest';
import type { CharacterPlayerModel } from '../board/boardRenderModel';
import { getCharacterLandingAnchor, getCharacterOccupantOffsets } from '../board/architecture/tileAnchors';
import { assignCharacterSlots } from './characterPlacement';

const player = (overrides: Partial<CharacterPlayerModel>): CharacterPlayerModel => ({
  playerId: 'player',
  name: 'Player',
  color: 'red',
  characterId: 'dog',
  tileId: 1,
  isActive: false,
  joinOrder: 1,
  ...overrides,
});

describe('character placement', () => {
  it.each([1, 2, 3, 4])('provides a deterministic layout for %i occupants', count => {
    const first = getCharacterOccupantOffsets(count);
    const second = getCharacterOccupantOffsets(count);
    expect(first).toHaveLength(count);
    expect(first).toEqual(second);
    expect(new Set(first.map(offset => offset.join(','))).size).toBe(count);
    expect(first.every(([x, , z]) => Math.abs(x) <= 0.5 && Math.abs(z) <= 0.5)).toBe(true);
    expect(getCharacterLandingAnchor(1, count - 1, count)).toEqual(
      getCharacterLandingAnchor(1, count - 1, count),
    );
  });

  it('sorts same-tile occupants by join order and then player id', () => {
    const occupants = assignCharacterSlots([
      player({ playerId: 'zeta', joinOrder: 2 }),
      player({ playerId: 'alpha', joinOrder: 2 }),
      player({ playerId: 'first', joinOrder: 1 }),
      player({ playerId: 'other-tile', tileId: 2, joinOrder: 0 }),
    ]);

    expect(occupants.filter(occupant => occupant.player.tileId === 1).map(occupant => ({
      id: occupant.player.playerId,
      slot: occupant.slotIndex,
      count: occupant.occupantCount,
    }))).toEqual([
      { id: 'first', slot: 0, count: 3 },
      { id: 'alpha', slot: 1, count: 3 },
      { id: 'zeta', slot: 2, count: 3 },
    ]);
  });

  it.each([1, 11, 21, 31])('uses the canonical transform on board side tile %i', tileId => {
    const positions = [0, 1, 2, 3].map(slot => getCharacterLandingAnchor(tileId, slot, 4));
    expect(positions.every(position => position?.every(Number.isFinite))).toBe(true);
    expect(new Set(positions.map(position => position?.join(','))).size).toBe(4);
  });
});
