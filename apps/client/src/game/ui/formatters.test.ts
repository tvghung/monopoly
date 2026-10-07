import { describe, expect, it } from 'vitest';
import { getTileBoardName, getTileName } from './formatters';

describe('localized tile names', () => {
  it('translates special spaces while keeping Vietnamese place names as canonical names', () => {
    expect(getTileName(0, 'en')).toBe('GO');
    expect(getTileName(4, 'en')).toBe('Income Tax');
    expect(getTileName(12, 'en')).toBe('Electric Company');
    expect(getTileName(5, 'en')).toBe('Hà Nội Station');
    expect(getTileName(1, 'en')).toBe('Cà Mau');
    expect(getTileName(0, 'vi')).toBe('Xuất Phát');
  });

  it('keeps compact 3D labels localized and leaves full accessible names available', () => {
    expect(getTileBoardName(5, 'en')).toBe('Station');
    expect(getTileBoardName(7, 'en')).toBe('Chance');
    expect(getTileBoardName(2, 'en')).toBe('Community Chest');
    expect(getTileBoardName(4, 'en')).toBe('Tax');
    expect(getTileBoardName(5, 'vi')).toBe('Ga tàu');
    expect(getTileBoardName(12, 'en')).toBe('Electric Company');
    expect(getTileName(5, 'en')).toBe('Hà Nội Station');
  });
});
