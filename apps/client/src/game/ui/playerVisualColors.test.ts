import { describe, expect, it } from 'vitest';
import { getPlayerDisplayColor, getPlayerDisplayForeground } from './playerVisualColors';
import { getPropertyGroupDisplayColor } from './propertyVisualColors';

describe('vivid presentation color mappings', () => {
  it('maps semantic player colors without changing their raw values', () => {
    expect(getPlayerDisplayColor('red')).toBe('#e54659');
    expect(getPlayerDisplayColor('white')).toBe('#fff6dd');
    expect(getPlayerDisplayForeground('white')).toBe('#183344');
  });

  it('keeps canonical property groups visually distinct', () => {
    expect(getPropertyGroupDisplayColor('brown')).toBe('#a85532');
    expect(getPropertyGroupDisplayColor('blue')).toBe('#536ddd');
    expect(getPropertyGroupDisplayColor('railroad')).toBe('#546982');
  });
});
