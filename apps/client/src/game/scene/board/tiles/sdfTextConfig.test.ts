import { describe, expect, it, vi } from 'vitest';
import { BOARD_FONT_GLYPH_SAMPLES, BOARD_FONT_URL } from '../../../../design-system/typography/gameFonts';
import { configureSdfText, TILE_SDF_GLYPH_SIZE } from './sdfTextConfig';
import { limitSurfaceTextLines } from './SdfSurfaceText';

describe('SDF surface text contract', () => {
  it('configures a local Vietnamese font, readable bounds, and sync lifecycle', () => {
    const target = {
      text: '', font: null, fontSize: 0, maxWidth: 0, maxHeight: 0,
      anchorX: 0, anchorY: 0, textAlign: '', lineHeight: 0, color: '',
      sdfGlyphSize: 0, sync: vi.fn(),
    };
    const onSync = vi.fn();
    configureSdfText(
      target,
      { value: 'Đồng Khởi', fontSize: 0.16, maxWidth: 1.1 },
      onSync,
    );
    expect(target.text).toBe('Đồng Khởi');
    expect(target.font).toBe(BOARD_FONT_URL);
    expect(BOARD_FONT_URL).toMatch(/BeVietnamPro-ExtraBold/);
    expect(BOARD_FONT_GLYPH_SAMPLES).toEqual([
      'Cà Mau',
      'Buôn Ma Thuột',
      'Đà Nẵng',
      'Phú Quốc',
      'Công Ty Nước',
      'Khí vận',
      'Cơ hội',
    ]);
    expect(target.maxWidth).toBe(1.1);
    expect(target.maxHeight).toBeCloseTo(0.16 * 3.4);
    expect(target.sdfGlyphSize).toBe(TILE_SDF_GLYPH_SIZE);
    expect(target.sync).toHaveBeenCalledTimes(1);
    expect(target.sync).toHaveBeenCalledWith(onSync);
  });

  it('accepts a taller physical-card text area without changing tile defaults', () => {
    const target = {
      text: '', font: null, fontSize: 0, maxWidth: 0, maxHeight: 0,
      anchorX: 0, anchorY: 0, textAlign: '', lineHeight: 0, color: '',
      sdfGlyphSize: 0, sync: vi.fn(),
    };
    configureSdfText(target, {
      value: 'Tổ chức sự kiện cộng đồng, tặng mỗi người chơi 50.000 ₫.',
      fontSize: 0.125,
      maxWidth: 1.48,
      maxHeight: 0.82,
    });
    expect(target.maxHeight).toBe(0.82);
  });

  it('limits surface labels to a compact number of lines without generic filler', () => {
    expect(limitSurfaceTextLines('Cà Mau')).toBe('Cà Mau');
    expect(limitSurfaceTextLines('Khu phố có rất nhiều tên dài cần gói lại', 2, 3)).toBe('Khu phố có rất nhiều…');
  });
});
