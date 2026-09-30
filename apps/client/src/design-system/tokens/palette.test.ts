import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';
import {
  CONTRAST_MINIMUM,
  CONTRAST_REQUIREMENTS,
  OTB_PALETTE,
  otbVariable,
  type OtbPaletteKey,
} from './palette';

// A variable path keeps Vite from rewriting the URL into an asset reference.
const paletteCssPath = './palette.css';
const paletteCss = readFileSync(fileURLToPath(new URL(paletteCssPath, import.meta.url)), 'utf8');

function parseCssPalette(css: string): Record<string, string> {
  const entries = [...css.matchAll(/(--otb-[a-z0-9-]+):\s*([^;]+);/g)]
    .map(match => [match[1], match[2].trim()] as const);
  return Object.fromEntries(entries);
}

const paletteKeys = Object.keys(OTB_PALETTE) as OtbPaletteKey[];

describe('palette.css and palette.ts parity', () => {
  const css = parseCssPalette(paletteCss);

  it('declares exactly the mirrored variables', () => {
    expect(Object.keys(css).sort()).toEqual(paletteKeys.map(otbVariable).sort());
  });

  it.each(paletteKeys)('keeps %s identical in CSS and TypeScript', key => {
    expect(css[otbVariable(key)].toLowerCase()).toBe(OTB_PALETTE[key].toLowerCase());
  });
});

describe('contrast utility', () => {
  it('matches the WCAG reference values', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 10);
    expect(contrastRatio('#777', '#FFF')).toBeCloseTo(4.48, 2);
  });

  it('is symmetric and rejects non-hex colors', () => {
    expect(contrastRatio('#123456', '#FEDCBA')).toBeCloseTo(contrastRatio('#FEDCBA', '#123456'), 10);
    expect(() => contrastRatio(OTB_PALETTE['ink-alpha-12'], '#FFFFFF')).toThrow();
  });
});

describe('verified contrast pairs (plan 01 §8.2)', () => {
  it.each(CONTRAST_REQUIREMENTS)(
    '$foreground on $background reaches its $use level',
    ({ foreground, background, use, recorded }) => {
      const ratio = contrastRatio(OTB_PALETTE[foreground], OTB_PALETTE[background]);
      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_MINIMUM[use]);
      // The recorded value documents the measurement; a palette edit that moves it must be deliberate.
      expect(Math.abs(ratio - recorded)).toBeLessThan(0.02);
    },
  );

  it('keeps muted text off paper-200 for normal text', () => {
    const ratio = contrastRatio(OTB_PALETTE['ink-500'], OTB_PALETTE['paper-200']);
    expect(ratio).toBeLessThan(CONTRAST_MINIMUM['text-aa']);
  });

  it('separates paper panels from the oak table only through elevation and border', () => {
    const ratio = contrastRatio(OTB_PALETTE['paper-50'], OTB_PALETTE['table-oak']);
    expect(ratio).toBeLessThan(2);
  });
});
