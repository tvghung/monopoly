import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { BOARD_FONT_GLYPH_SAMPLES, BOARD_FONT_URL } from '../../../../design-system/typography/gameFonts';
import { configureSdfText, TILE_SDF_GLYPH_SIZE } from './sdfTextConfig';
import { limitSurfaceTextLines } from './SdfSurfaceText';

describe('SDF surface text contract', () => {
  it('configures a local Vietnamese font, readable bounds, and sync lifecycle', () => {
    const target = {
      text: '', font: null, fontSize: 0, maxWidth: 0, maxHeight: 0,
      anchorX: 0, anchorY: 0, textAlign: '', lineHeight: 0, color: '',
      whiteSpace: 'normal', overflowWrap: 'normal',
      outlineColor: '', outlineWidth: 0, outlineOpacity: 0,
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
      'Khí Vận',
      'Cơ Hội',
    ]);
    expect(target.maxWidth).toBe(1.1);
    expect(target.maxHeight).toBeCloseTo(0.16 * 3.4);
    expect(target.whiteSpace).toBe('normal');
    expect(target.overflowWrap).toBe('normal');
    expect(target.sdfGlyphSize).toBe(TILE_SDF_GLYPH_SIZE);
    expect(target.sync).toHaveBeenCalledTimes(1);
    expect(target.sync).toHaveBeenCalledWith(onSync);
  });

  it('accepts a taller physical-card text area without changing tile defaults', () => {
    const target = {
      text: '', font: null, fontSize: 0, maxWidth: 0, maxHeight: 0,
      anchorX: 0, anchorY: 0, textAlign: '', lineHeight: 0, color: '',
      whiteSpace: 'normal', overflowWrap: 'normal',
      outlineColor: '', outlineWidth: 0, outlineOpacity: 0,
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

  it('can preserve deterministic board line breaks without Troika reflow', () => {
    const target = {
      text: '', font: null, fontSize: 0, maxWidth: 0, maxHeight: 0,
      anchorX: 0, anchorY: 0, textAlign: '', lineHeight: 0, color: '',
      whiteSpace: 'normal', overflowWrap: 'normal',
      outlineColor: '', outlineWidth: 0, outlineOpacity: 0,
      sdfGlyphSize: 0, sync: vi.fn(),
    };
    configureSdfText(target, {
      value: 'Buôn Ma\nThuột',
      fontSize: 0.29,
      maxWidth: 1.31,
      whiteSpace: 'nowrap',
      overflowWrap: 'normal',
    });
    expect(target.whiteSpace).toBe('nowrap');
    expect(target.overflowWrap).toBe('normal');
  });

  it('configures a restrained readable outline without changing the fill', () => {
    const target = {
      text: '', font: null, fontSize: 0, maxWidth: 0, maxHeight: 0,
      anchorX: 0, anchorY: 0, textAlign: '', lineHeight: 0, color: '',
      whiteSpace: 'normal', overflowWrap: 'normal',
      outlineColor: '', outlineWidth: 0, outlineOpacity: 0,
      sdfGlyphSize: 0, sync: vi.fn(),
    };
    configureSdfText(target, {
      value: '2.400.000 ₫',
      fontSize: 0.42,
      maxWidth: 2.8,
      color: '#f7f1d8',
      outlineColor: '#14231f',
      outlineWidth: 0.0168,
      outlineOpacity: 0.72,
    });
    expect(target.color).toBe('#f7f1d8');
    expect(target.outlineColor).toBe('#14231f');
    expect(target.outlineWidth).toBe(0.0168);
    expect(target.outlineOpacity).toBe(0.72);
  });

  it('limits surface labels to a compact number of lines without generic filler', () => {
    expect(limitSurfaceTextLines('Cà Mau')).toBe('Cà Mau');
    expect(limitSurfaceTextLines('Khu phố có rất nhiều tên dài cần gói lại', 2, 3)).toBe('Khu phố có rất nhiều…');
  });

  it('routes every affected board label through the shared SDF components', () => {
    const readSource = (relativePath: string) => readFileSync(
      fileURLToPath(new URL(relativePath, import.meta.url)),
      'utf8',
    );

    expect(readSource('./TileTextLayer.tsx')).toContain('<SdfSurfaceText');
    const stations = readSource('../../stations/PlayerStationLayer.tsx');
    expect(stations).toContain('<SdfBillboardText');
    expect(stations).toContain('name={`PlayerStationName:');
    expect(stations).toContain('name={`PlayerStationBalance:');
    expect(readSource('../../dice/DiceLayer.tsx')).toContain('name="DiceResultTotal"');
    const cards = readSource('../../cards/PhysicalCardDecks.tsx');
    expect(cards).toContain('<SdfSurfaceText');
    expect(cards).toContain('value={card.message}');
  });
});
