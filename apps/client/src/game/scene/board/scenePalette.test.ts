import { describe, expect, it } from 'vitest';
import { relativeLuminance } from '../../../design-system/tokens/contrast';
import { OTB_PALETTE } from '../../../design-system/tokens/palette';
import { getPropertyGroupVisualStyle } from '../../ui/propertyVisualColors';
import { TRAY_LACQUER_COLOR } from '../stations/stationWorld';
import { CANONICAL_PROPERTY_GROUPS, getPropertyVisualDescriptor } from './architecture/tileVisualRegistry';
import { boardVisualTokens, SCENE_PALETTE_SOURCES } from './boardVisualTokens';

/** Hue in degrees (0 to 360) of an opaque #RRGGBB color; grays have no hue and return null. */
function hue(hex: string): number | null {
  const [red, green, blue] = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  if (delta < 0.02) return null;
  let sector: number;
  if (max === red) sector = ((green - blue) / delta) % 6;
  else if (max === green) sector = (blue - red) / delta + 2;
  else sector = (red - green) / delta + 4;
  return (sector * 60 + 360) % 360;
}

function hueDistance(first: string, second: string): number {
  const a = hue(first);
  const b = hue(second);
  if (a === null || b === null) return 0;
  const difference = Math.abs(a - b);
  return Math.min(difference, 360 - difference);
}

/** Luminance of the v1 value each scene token replaced (plan 02 T02.16 keeps light surfaces light). */
const V1_LUMINANCE: Record<keyof typeof SCENE_PALETTE_SOURCES, string> = {
  boardFrame: '#215a58',
  boardBaseEdge: '#113c49',
  tileSocket: '#355250',
  boardTop: '#b8efd0',
  airportField: '#8bcf4a',
  airportFieldDark: '#4f8f43',
  boardCenter: '#9bd667',
  centerPath: '#b6db7c',
  boardBase: '#858d90',
  boardOuterAccent: '#e7ebea',
};

describe('scene palette harmonization (plan 02 T02.16)', () => {
  it('keeps every mapped scene token in the hue family of its OTB palette source', () => {
    for (const [token, source] of Object.entries(SCENE_PALETTE_SOURCES)) {
      const value = boardVisualTokens[token as keyof typeof SCENE_PALETTE_SOURCES];
      const sourceHex = OTB_PALETTE[source];
      // The board base and the outer accent are near neutral: their warmth is checked by the hue distance
      // below only when the color still has a hue, so a stone that turned neutral does not fail.
      expect(hueDistance(value, sourceHex), `${token} vs ${source}`).toBeLessThanOrEqual(30);
    }
  });

  it('keeps the luminance of the v1 value so light surfaces stay light and text stays readable', () => {
    for (const [token, v1] of Object.entries(V1_LUMINANCE)) {
      const value = boardVisualTokens[token as keyof typeof V1_LUMINANCE];
      expect(Math.abs(relativeLuminance(value) - relativeLuminance(v1)), token).toBeLessThan(0.03);
    }
  });

  it('takes the frame and accent straight from the palette', () => {
    expect(boardVisualTokens.boardFrame).toBe(OTB_PALETTE['jade-700']);
    expect(boardVisualTokens.boardAccent).toBe(OTB_PALETTE['gold-400']);
  });

  it('derives the tray lacquer from the palette: dark ink with a breath of lacquer red', () => {
    expect(relativeLuminance(TRAY_LACQUER_COLOR)).toBeLessThan(0.03);
    expect(hueDistance(TRAY_LACQUER_COLOR, OTB_PALETTE['lacquer-700'])).toBeLessThanOrEqual(30);
  });

  it('gives each district descriptor the hue of its plan 01 section 8.4 color at a light, sparse tone', () => {
    const groups = CANONICAL_PROPERTY_GROUPS.filter(group => group !== 'brown');
    for (const group of groups) {
      const dom = getPropertyGroupVisualStyle(group, 'v2').color;
      const descriptor = getPropertyVisualDescriptor(group);
      expect(hueDistance(descriptor.baseColor, dom), `${group} base`).toBeLessThanOrEqual(12);
      // The blue district keeps its warm stone secondary and grout by design (premium brown stone).
      if (group !== 'blue') {
        expect(hueDistance(descriptor.secondaryColor, dom), `${group} secondary`).toBeLessThanOrEqual(35);
      }
      // Light and sparse: the upper art must not turn into a dark panel.
      expect(relativeLuminance(descriptor.baseColor), `${group} base luminance`).toBeGreaterThan(0.2);
    }
    // Brown is a low-saturation hue: it only has to stay warm and light.
    const brown = getPropertyVisualDescriptor('brown');
    expect(hueDistance(brown.baseColor, getPropertyGroupVisualStyle('brown', 'v2').color)).toBeLessThanOrEqual(25);
    expect(relativeLuminance(brown.baseColor)).toBeGreaterThan(0.3);
  });

  it('keeps the eight districts visually distinct from each other', () => {
    const bases = CANONICAL_PROPERTY_GROUPS.map(group => getPropertyVisualDescriptor(group).baseColor);
    expect(new Set(bases).size).toBe(bases.length);
    const red = getPropertyVisualDescriptor('red').baseColor;
    const pink = getPropertyVisualDescriptor('pink').baseColor;
    expect(hueDistance(red, pink)).toBeGreaterThanOrEqual(20);
  });
});
