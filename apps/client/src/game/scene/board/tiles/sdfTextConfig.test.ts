import { describe, expect, it, vi } from 'vitest';
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
    expect(target.font).toMatch(/be-vietnam-pro-vietnamese-700-normal/);
    expect(target.maxWidth).toBe(1.1);
    expect(target.sdfGlyphSize).toBe(TILE_SDF_GLYPH_SIZE);
    expect(target.sync).toHaveBeenCalledTimes(1);
    expect(target.sync).toHaveBeenCalledWith(onSync);
  });

  it('limits surface labels to a compact number of lines without generic filler', () => {
    expect(limitSurfaceTextLines('Cà Mau')).toBe('Cà Mau');
    expect(limitSurfaceTextLines('Khu phố có rất nhiều tên dài cần gói lại', 2, 3)).toBe('Khu phố có rất nhiều…');
  });
});
