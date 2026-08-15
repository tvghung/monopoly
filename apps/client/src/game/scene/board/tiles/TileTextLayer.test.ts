import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { getBoardTileLayout } from '../boardLayout';
import { getTileTextPresentation } from './TileTextLayer';

describe('commercial tile typography', () => {
  it('shows a short property name on one large line without its price', () => {
    const tile = tileState[1];
    const size = getBoardTileLayout(1)!.size;
    const presentation = getTileTextPresentation(tile, tile.streetName, size);

    expect(presentation.value).toBe('Cà Mau');
    expect(presentation.value).not.toContain('60.000');
    expect(presentation.fontSize).toBe(0.205);
    expect(presentation.maxWidth).toBeCloseTo((size[0] - 0.08) * 0.9);
  });

  it('balances the longest canonical property name over two lines', () => {
    const tile = tileState[6];
    const presentation = getTileTextPresentation(
      tile,
      tile.streetName,
      getBoardTileLayout(6)!.size,
    );

    expect(tile.streetName).toBe('Buôn Ma Thuột');
    expect(presentation.value).toBe('Buôn Ma\nThuột');
    expect(presentation.fontSize).toBe(0.19);
    expect(presentation.value.split('\n')).toHaveLength(2);
  });

  it('uses three lines only when a real long Vietnamese place name needs them', () => {
    const tile = tileState[6];
    const presentation = getTileTextPresentation(
      tile,
      'Khu đô thị mới Thủ Thiêm',
      getBoardTileLayout(6)!.size,
    );

    expect(presentation.value).toBe('Khu đô\nthị mới\nThủ Thiêm');
    expect(presentation.fontSize).toBe(0.17);
    expect(presentation.value.split('\n')).toHaveLength(3);
  });

  it('retains useful label, station name, and price hierarchy on special tiles', () => {
    const tile = tileState[5];
    const presentation = getTileTextPresentation(
      tile,
      tile.streetName,
      getBoardTileLayout(5)!.size,
    );

    expect(presentation.value).toMatch(/^GA TÀU\nGa Hà Nội\n200\.000 ₫$/);
  });
});
