import { afterEach, describe, expect, it } from 'vitest';
import { contrastRatio } from '../../design-system/tokens/contrast';
import {
  getPropertyGroupDisplayColor,
  getPropertyGroupVisualStyle,
  readDocumentVisualTheme,
} from './propertyVisualColors';

afterEach(() => {
  delete document.documentElement.dataset.visualTheme;
});

const V2_HEADER_CONTRAST: Record<string, number> = {
  brown: 5.68,
  lightblue: 8.25,
  pink: 6.11,
  orange: 6.9,
  red: 4.93,
  yellow: 9.73,
  green: 5.12,
  blue: 6.09,
  railroad: 11.31,
  utility: 4.59,
};

describe('property group visual styles', () => {
  it('keeps the v1 palette unchanged when no theme attribute is set', () => {
    expect(readDocumentVisualTheme()).toBe('v1');
    expect(getPropertyGroupDisplayColor('brown')).toBe('#a8522f');
    expect(getPropertyGroupDisplayColor('blue')).toBe('#4a63d9');
    expect(getPropertyGroupVisualStyle('utility').label).toBe('Tài sản');
  });

  it('gives every v1 group a readable header text color', () => {
    for (const group of Object.keys(V2_HEADER_CONTRAST).filter(key => key !== 'utility')) {
      const style = getPropertyGroupVisualStyle(group, 'v1');
      expect(contrastRatio(style.headerText, style.color)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(Object.entries(V2_HEADER_CONTRAST))(
    'meets 4.5:1 for the v2 %s header (recorded %s)',
    (group, recorded) => {
      const style = getPropertyGroupVisualStyle(group, 'v2');
      const ratio = contrastRatio(style.headerText, style.color);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(Math.abs(ratio - recorded)).toBeLessThan(0.02);
    },
  );

  it('derives v2 tints as light mixes of the district color over paper', () => {
    for (const group of Object.keys(V2_HEADER_CONTRAST)) {
      const style = getPropertyGroupVisualStyle(group, 'v2');
      expect(style.tint).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastRatio(style.tint, '#FFFBF3')).toBeLessThan(1.6);
    }
    expect(getPropertyGroupVisualStyle('red', 'v2').tint).not.toBe(getPropertyGroupVisualStyle('red', 'v1').tint);
  });

  it('follows the document theme attribute by default', () => {
    document.documentElement.dataset.visualTheme = 'v2';
    expect(readDocumentVisualTheme()).toBe('v2');
    expect(getPropertyGroupDisplayColor('brown')).toBe('#8D5B3E');
    expect(getPropertyGroupVisualStyle('utility').motif).toBe('utility');
    expect(getPropertyGroupVisualStyle(null).label).toBe('Tài sản');
  });
});
