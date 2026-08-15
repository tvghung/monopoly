import { describe, expect, it } from 'vitest';
import { getPlayerDisplayColor, getPlayerDisplayForeground } from './playerVisualColors';
import { getPropertyGroupDisplayColor } from './propertyVisualColors';

describe('pastel presentation color mappings', () => {
  it('maps semantic player colors without changing their raw values', () => {
    expect(getPlayerDisplayColor('red')).toBe('#ec8792');
    expect(getPlayerDisplayColor('white')).toBe('#f5efe6');
    expect(getPlayerDisplayForeground('white')).toBe('#34454d');
  });

  it('keeps canonical property groups visually distinct', () => {
    expect(getPropertyGroupDisplayColor('brown')).toBe('#c7a27f');
    expect(getPropertyGroupDisplayColor('blue')).toBe('#88a8e4');
    expect(getPropertyGroupDisplayColor('railroad')).toBe('#a8b7c4');
  });
});

