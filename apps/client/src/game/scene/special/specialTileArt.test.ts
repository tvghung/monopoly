import { describe, expect, it } from 'vitest';
import { getSpecialTileArtKind, getUtilityArtKind } from './specialTileArt';

describe('special tile art contracts', () => {
  it('uses dedicated SVG asset mappings for special tiles and utilities', () => {
    expect(getSpecialTileArtKind('chance')).toBe('chance-question-svg');
    expect(getSpecialTileArtKind('chest')).toBe('fortune-wheel-svg');
    expect(getSpecialTileArtKind('railroad')).toBe('railroad-train-svg');
    expect(getSpecialTileArtKind('expense')).toBe('tax-paper-stack-2d');
    expect(getSpecialTileArtKind('jail')).toBe('jail-bars-2d');
    expect(getSpecialTileArtKind('company')).toBe('electric-bulb-svg');
    expect(getUtilityArtKind('Công Ty Điện')).toBe('electric-bulb-svg');
    expect(getUtilityArtKind('Công Ty Nước')).toBe('water-faucet-svg');
  });

  it('keeps corner identity as separate landmark treatments', () => {
    expect(getSpecialTileArtKind('start')).toBe('start-sign');
    expect(getSpecialTileArtKind('parking')).toBe('parking-lot-2d');
    expect(getSpecialTileArtKind('gojail')).toBe('handcuffs-svg');
  });
});
