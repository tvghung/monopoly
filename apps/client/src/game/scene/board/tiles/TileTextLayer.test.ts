import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { getBoardTileLayout } from '../boardLayout';
import { getTileTextPresentation } from './TileTextLayer';
import { getInwardTextTopDirection, getTilePanelLayoutForTileSize } from './tilePanelLayout';

describe('commercial tile typography', () => {
  it('shows a short property name on one large line without its price', () => {
    const tile = tileState[1];
    const size = getBoardTileLayout(1)!.size;
    const presentation = getTileTextPresentation(tile, tile.streetName, size);

    expect(presentation.value).toBe('Cà Mau');
    expect(presentation.value).not.toContain('60.000');
    expect(presentation.fontSize).toBe(0.255);
    expect(presentation.maxWidth).toBeCloseTo((size[0] - 0.08) * 0.96);
    expect(presentation.footer).toBe(true);
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
    expect(presentation.fontSize).toBe(0.225);
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
    expect(presentation.fontSize).toBe(0.195);
    expect(presentation.value.split('\n')).toHaveLength(3);
  });

  it('uses a single readable footer label for special tiles without price text', () => {
    const tile = tileState[5];
    const presentation = getTileTextPresentation(
      tile,
      tile.streetName,
      getBoardTileLayout(5)!.size,
    );

    expect(presentation.value).toBe('Ga tàu');
    expect(presentation.value).not.toContain('Ga Hà Nội');
    expect(presentation.value).not.toContain('200.000');
    expect(presentation.footer).toBe(true);
  });

  it('keeps both runs adjacent to Parking on the shared inward-facing text rule', () => {
    const leftSide = getBoardTileLayout(19)!.side;
    const topSide = getBoardTileLayout(21)!.side;
    expect(getInwardTextTopDirection(leftSide)).toEqual([1, 0]);
    expect(getInwardTextTopDirection(topSide)).toEqual([0, 1]);

    const left = getTileTextPresentation(tileState[19], tileState[19].streetName, getBoardTileLayout(19)!.size);
    const top = getTileTextPresentation(tileState[21], tileState[21].streetName, getBoardTileLayout(21)!.size);
    const footerZ = getTilePanelLayoutForTileSize(getBoardTileLayout(19)!.size).footerCenterLocalZ;
    expect(left.footer).toBe(true);
    expect(top.footer).toBe(true);
    expect(left.positionZ).toBeCloseTo(footerZ);
    expect(top.positionZ).toBeCloseTo(footerZ);
  });
});
