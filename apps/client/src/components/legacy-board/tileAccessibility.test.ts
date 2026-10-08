import { describe, expect, it } from 'vitest';
import { makeRoom, makeTeamRoom } from '../../game/presentation/testFixtures';
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

  it('names the hotel in English with the English landmark name when the language is English', () => {
    const room = makeRoom();
    room.gameState.boardState.ownedProps = { 13: { id: 'player-a', color: 'red', houses: 5 } };
    const label = getTileAccessibilityLabel(13, room.gameState, 'en');
    expect(label).toContain('Hotel · Chùa Cầu Temple');
    expect(label).not.toContain('Khách sạn');
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

describe('getTileAccessibilityLabel in a 2v2 game', () => {
  it('names the owner\'s team after the owner, so teammates sharing a colour can be told apart', () => {
    const room = makeTeamRoom();
    room.gameState.boardState.ownedProps = { 13: { id: 'player-c', color: 'red', houses: 0 } };
    const label = getTileAccessibilityLabel(13, room.gameState);
    expect(label).toContain('Chủ sở hữu: Chi (đội Team 1)');
    expect(label.startsWith('Ô 13: Hội An')).toBe(true);
    expect(label.endsWith('Mở chi tiết ô cờ')).toBe(true);
  });

  it('leaves the Solo label exactly as it was', () => {
    const room = makeRoom();
    room.gameState.boardState.ownedProps = { 13: { id: 'player-a', color: 'red', houses: 0 } };
    expect(getTileAccessibilityLabel(13, room.gameState)).toContain('Chủ sở hữu: An. ');
    expect(getTileAccessibilityLabel(13, room.gameState)).not.toContain('đội');
  });
});
