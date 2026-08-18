import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '@monopoly/shared';
import { colorizeCharacterSvg } from './characterSvg';
import { CHARACTER_REGISTRY } from './characterRegistry';

describe('character registry', () => {
  it('has exactly one local SVG definition for every stable character id', () => {
    expect(Object.keys(CHARACTER_REGISTRY).sort()).toEqual([...CHARACTER_IDS].sort());
    CHARACTER_IDS.forEach(characterId => {
      const definition = CHARACTER_REGISTRY[characterId];
      expect(definition.id).toBe(characterId);
      expect(definition.svgSource.trimStart()).toMatch(/^<svg/u);
      expect(definition.svgSource).toContain('#FF00FF');
      expect(definition.svgSource).toContain('#CC00CC');
      expect(definition.svgSource).not.toMatch(/<script\b/iu);
      const red = colorizeCharacterSvg(definition.svgSource, 'red');
      const blue = colorizeCharacterSvg(definition.svgSource, 'blue');
      expect(red).toContain('#f2384a');
      expect(blue).toContain('#3567f2');
      expect(red).not.toContain('#FF00FF');
      expect(red).not.toContain('#CC00CC');
      expect(blue).not.toContain('#FF00FF');
      expect(blue).not.toContain('#CC00CC');
    });
  });

  it('keeps base art stable while changing the player accent', () => {
    const source = CHARACTER_REGISTRY.shiba.svgSource;
    const red = colorizeCharacterSvg(source, 'red');
    const blue = colorizeCharacterSvg(source, 'blue');

    expect(red).not.toEqual(blue);
    expect(red).toContain('#d9823b');
    expect(blue).toContain('#d9823b');
    expect(red).toContain('#f2384a');
    expect(blue).toContain('#3567f2');
  });
});
