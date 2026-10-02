import { describe, expect, it } from 'vitest';
import { makeRoom } from '../../game/presentation/testFixtures';
import { getTileAccessibilityLabel } from './tileAccessibility';

function labelFor(tileId: number, houses?: number): string {
  const room = makeRoom();
  room.gameState.boardState.ownedProps = houses === undefined
    ? {}
    : { [tileId]: { id: 'player-a', color: 'red', houses } };
  return getTileAccessibilityLabel(tileId, room.gameState);
}

describe('getTileAccessibilityLabel', () => {
  it('names a hotel by the landmark that stands for it', () => {
    expect(labelFor(13, 5)).toContain('Có Khách sạn · Chùa Cầu');
    expect(labelFor(39, 5)).toContain('Có Khách sạn · Landmark 81');
  });

  it('keeps houses as plain counts and says nothing about a landmark before the hotel', () => {
    expect(labelFor(13, 3)).toContain('Có 3 Nhà');
    expect(labelFor(13, 3)).not.toContain('Chùa Cầu');
    expect(labelFor(13)).not.toContain('Khách');
    expect(labelFor(13, 0)).not.toContain('Có ');
  });

  it('still starts with the tile number and name and ends with the way to open the details', () => {
    const label = labelFor(13, 5);
    expect(label.startsWith('Ô 13: Hội An')).toBe(true);
    expect(label.endsWith('Mở chi tiết ô cờ')).toBe(true);
    expect(label).toContain('Chủ sở hữu: An');
  });
});
