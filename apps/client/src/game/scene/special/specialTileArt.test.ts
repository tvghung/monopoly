import { describe, expect, it } from 'vitest';
import { getSpecialTileArtKind } from './specialTileArt';

describe('special tile art contracts', () => {
  it('uses flat art for chance, chest, railroad, tax, jail and utility tiles', () => {
    expect(getSpecialTileArtKind('chance')).toBe('lucky-wheel-2d');
    expect(getSpecialTileArtKind('chest')).toBe('lucky-wheel-2d');
    expect(getSpecialTileArtKind('railroad')).toBe('railroad-flat');
    expect(getSpecialTileArtKind('expense')).toBe('tax-paper-stack-2d');
    expect(getSpecialTileArtKind('jail')).toBe('jail-bars-2d');
    expect(getSpecialTileArtKind('company')).toBe('utility-flat');
  });

  it('keeps corner identity as separate flat/marker treatments', () => {
    expect(getSpecialTileArtKind('start')).toBe('start-token');
    expect(getSpecialTileArtKind('parking')).toBe('parking-flat');
    expect(getSpecialTileArtKind('gojail')).toBe('police-2d');
  });
});
