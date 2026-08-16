import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { getBoardTileLayout } from '../boardLayout';
import { getTileTextPresentation, shouldRenderTileText } from './TileTextLayer';
import {
  getInwardTextTopDirection,
  getOrientedTilePanelLayoutForTileSize,
} from './tilePanelLayout';

describe('commercial tile typography', () => {
  it('shows a short property name on one large line without its price', () => {
    const tile = tileState[1];
    const size = getBoardTileLayout(1)!.size;
    const presentation = getTileTextPresentation(
      tile,
      tile.streetName,
      getOrientedTilePanelLayoutForTileSize(size, 'BOTTOM'),
    );

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
      getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(6)!.size, 'BOTTOM'),
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
      getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(6)!.size, 'BOTTOM'),
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
      getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(5)!.size, 'BOTTOM'),
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
    const leftPanel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(19)!.size, leftSide);
    const topPanel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(21)!.size, topSide);
    const bottomPanel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(19)!.size, 'BOTTOM');
    const rightPanel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(19)!.size, 'RIGHT');
    expect(leftPanel.contentRotationY).toBe(Math.PI);
    expect(topPanel.contentRotationY).toBe(Math.PI);
    expect(bottomPanel.contentRotationY).toBe(0);
    expect(rightPanel.contentRotationY).toBe(0);

    const left = getTileTextPresentation(tileState[19], tileState[19].streetName, leftPanel);
    const top = getTileTextPresentation(tileState[21], tileState[21].streetName, topPanel);
    const footerZ = leftPanel.footerCenterLocalZ;
    expect(left.footer).toBe(true);
    expect(top.footer).toBe(true);
    expect(left.positionZ).toBeCloseTo(footerZ);
    expect(top.positionZ).toBeCloseTo(footerZ);
  });

  it('removes jail and go-to-jail text so their icons carry the meaning', () => {
    expect(shouldRenderTileText(tileState[10].tileType)).toBe(false);
    expect(shouldRenderTileText(tileState[30].tileType)).toBe(false);
    expect(shouldRenderTileText(tileState[5].tileType)).toBe(true);
  });
});
