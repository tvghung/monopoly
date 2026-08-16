import { chestCards } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import {
  createFortuneWheelGeometry,
  FORTUNE_WHEEL_RADIUS_RATIO,
  FORTUNE_WHEEL_SEGMENT_COUNT,
  getFortuneWheelColors,
} from './CardDeckVisual';
import { getSpecialTileArtKind, getUtilityArtKind } from './specialTileArt';

describe('special tile art contracts', () => {
  it('uses dedicated 2D art for chance, fortune, railroad, tax, jail and utilities', () => {
    expect(getSpecialTileArtKind('chance')).toBe('question-mark-2d');
    expect(getSpecialTileArtKind('chest')).toBe('fortune-wheel-2d');
    expect(getSpecialTileArtKind('railroad')).toBe('train-2d');
    expect(getSpecialTileArtKind('expense')).toBe('tax-paper-stack-2d');
    expect(getSpecialTileArtKind('jail')).toBe('jail-bars-2d');
    expect(getSpecialTileArtKind('company')).toBe('utility-flat');
    expect(getUtilityArtKind('Công Ty Điện')).toBe('electric-bulb-2d');
    expect(getUtilityArtKind('Công Ty Nước')).toBe('water-faucet-2d');
  });

  it('derives one colorful wheel cell from every shared Khí Vận card', () => {
    expect(FORTUNE_WHEEL_SEGMENT_COUNT).toBe(chestCards.length);
    const colors = getFortuneWheelColors();
    const geometry = createFortuneWheelGeometry(1, colors);
    expect(colors).toHaveLength(chestCards.length);
    expect(geometry.getAttribute('position').count).toBe(chestCards.length * 3);
    expect(colors.every((color, index) => color !== colors[index - 1])).toBe(true);
    geometry.dispose();
  });

  it('keeps the fortune wheel larger and vivid without a horizontal pointer line', () => {
    expect(FORTUNE_WHEEL_RADIUS_RATIO).toBeGreaterThan(0.3);
  });

  it('keeps corner identity as separate flat/marker treatments', () => {
    expect(getSpecialTileArtKind('start')).toBe('start-token');
    expect(getSpecialTileArtKind('parking')).toBe('parking-flat');
    expect(getSpecialTileArtKind('gojail')).toBe('police-2d');
  });
});
