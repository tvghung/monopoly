import { describe, expect, it } from 'vitest';
import { getPlayerDisplayColor, getPlayerDisplayForeground } from './playerVisualColors';
import { getPropertyGroupDisplayColor, getPropertyGroupVisualStyle } from './propertyVisualColors';

describe('vivid presentation color mappings', () => {
  it('maps semantic player colors to vivid display values', () => {
    expect(getPlayerDisplayColor('red')).toBe('#f2384a');
    expect(getPlayerDisplayColor('white')).toBe('#fff6dd');
    expect(getPlayerDisplayForeground('white')).toBe('#183344');
  });

  it('keeps canonical property groups visually distinct', () => {
    expect(getPropertyGroupDisplayColor('brown')).toBe('#a8522f');
    expect(getPropertyGroupDisplayColor('blue')).toBe('#4a63d9');
    expect(getPropertyGroupDisplayColor('railroad')).toBe('#426486');
    expect(getPropertyGroupVisualStyle('green').motif).toBe('eco');
    expect(getPropertyGroupVisualStyle('pink').motif).toBe('shopping');
  });
});
