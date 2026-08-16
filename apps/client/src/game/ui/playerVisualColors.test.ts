import { describe, expect, it } from 'vitest';
import { getPlayerDisplayColor, getPlayerDisplayForeground } from './playerVisualColors';
import { getPropertyGroupDisplayColor, getPropertyGroupVisualStyle } from './propertyVisualColors';

describe('vivid presentation color mappings', () => {
  it('maps semantic player colors to vivid display values', () => {
    expect(getPlayerDisplayColor('red')).toBe('#ef4056');
    expect(getPlayerDisplayColor('white')).toBe('#fff6dd');
    expect(getPlayerDisplayForeground('white')).toBe('#183344');
  });

  it('keeps canonical property groups visually distinct', () => {
    expect(getPropertyGroupDisplayColor('brown')).toBe('#ad5630');
    expect(getPropertyGroupDisplayColor('blue')).toBe('#536ddd');
    expect(getPropertyGroupDisplayColor('railroad')).toBe('#546982');
    expect(getPropertyGroupVisualStyle('green').motif).toBe('eco');
    expect(getPropertyGroupVisualStyle('pink').motif).toBe('shopping');
  });
});
