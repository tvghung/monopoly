import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import { getBoardTileLayout } from '../boardLayout';
import { getTileTextPresentation, shouldRenderTileText } from './TileTextLayer';
import {
  estimateBoardTextWidth,
  getBoardTextHeight,
  TILE_TEXT_SAFE_WIDTH_RATIO,
} from './tileTextFitting';
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
    expect(presentation.fontSize).toBe(0.34);
    expect(presentation.maxWidth).toBeCloseTo((size[0] - 0.08) * TILE_TEXT_SAFE_WIDTH_RATIO);
    expect(estimateBoardTextWidth(presentation.value, presentation.fontSize))
      .toBeLessThanOrEqual(presentation.maxWidth);
    expect(getBoardTextHeight(presentation.fontSize, 1, presentation.lineHeight))
      .toBeLessThanOrEqual(presentation.maxHeight);
    expect(presentation.whiteSpace).toBe('nowrap');
    expect(presentation.footer).toBe(true);
    expect(presentation.region).toBe('footer');
    expect(presentation.positionZ).toBeCloseTo(
      getOrientedTilePanelLayoutForTileSize(size, 'BOTTOM').footerCenterLocalZ,
    );
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
    expect(presentation.fontSize).toBe(0.30);
    expect(presentation.value.split('\n')).toHaveLength(2);
    expect(estimateBoardTextWidth(presentation.value, presentation.fontSize))
      .toBeLessThanOrEqual(presentation.maxWidth);
    expect(getBoardTextHeight(presentation.fontSize, 2, presentation.lineHeight))
      .toBeLessThanOrEqual(presentation.maxHeight);
  });

  it('keeps a long Vietnamese place name readable in two footer lines', () => {
    const tile = tileState[6];
    const presentation = getTileTextPresentation(
      tile,
      'Khu đô thị mới Thủ Thiêm',
      getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(6)!.size, 'BOTTOM'),
    );

    expect(presentation.fontSize).toBeGreaterThanOrEqual(0.29);
    expect(presentation.value.split('\n')).toHaveLength(2);
    expect(estimateBoardTextWidth(presentation.value, presentation.fontSize))
      .toBeLessThanOrEqual(presentation.maxWidth);
  });

  it.each([
    ['Cà Mau', 1],
    ['Huế', 1],
    ['Nguyễn Huệ', 2],
    ['Buôn Ma Thuột', 2],
    ['Phú Mỹ Hưng', 2],
    ['Landmark 81', 2],
  ] as const)('fits canonical normal label %s on at most two lines on every side', (name, expectedLineCount) => {
    (['BOTTOM', 'LEFT', 'TOP', 'RIGHT'] as const).forEach(side => {
      const panel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(1)!.size, side);
      const presentation = getTileTextPresentation(tileState[1], name, panel);
      expect(presentation.value.split('\n')).toHaveLength(expectedLineCount);
      expect(estimateBoardTextWidth(presentation.value, presentation.fontSize))
        .toBeLessThanOrEqual(presentation.maxWidth);
      expect(getBoardTextHeight(
        presentation.fontSize,
        expectedLineCount,
        presentation.lineHeight,
      )).toBeLessThanOrEqual(presentation.maxHeight);
      expect(presentation.fontSize).toBeGreaterThanOrEqual(0.29);
    });
  });

  it.each([
    ['Công Ty Điện', 2],
    ['Công Ty Nước', 2],
  ] as const)('fits company label %s without a third line', (name, expectedLineCount) => {
    const panel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(12)!.size, 'BOTTOM');
    const presentation = getTileTextPresentation(tileState[12], name, panel);
    expect(presentation.value.split('\n')).toHaveLength(expectedLineCount);
    expect(presentation.value.split('\n').length).toBeLessThanOrEqual(2);
    expect(estimateBoardTextWidth(presentation.value, presentation.fontSize))
      .toBeLessThanOrEqual(presentation.maxWidth);
    expect(getBoardTextHeight(
      presentation.fontSize,
      expectedLineCount,
      presentation.lineHeight,
    )).toBeLessThanOrEqual(presentation.maxHeight);
    expect(presentation.fontSize).toBeGreaterThanOrEqual(0.29);
  });

  it('uses a single readable upper label for special tiles without price text', () => {
    const tile = tileState[5];
    const panel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(5)!.size, 'BOTTOM');
    const presentation = getTileTextPresentation(
      tile,
      tile.streetName,
      panel,
    );

    expect(presentation.value).toBe('Ga tàu');
    expect(presentation.value).not.toContain('Ga Hà Nội');
    expect(presentation.value).not.toContain('200.000');
    expect(presentation.footer).toBe(true);
    expect(presentation.region).toBe('footer');
    expect(presentation.positionZ).toBeCloseTo(panel.footerCenterLocalZ);
  });

  it('anchors railroad, company, Chance, Chest and Tax labels in the 30% footer', () => {
    const cases = [
      [5, 'Ga tàu'],
      [12, 'Công Ty Điện'],
      [7, 'Cơ hội'],
      [2, 'Khí vận'],
      [4, 'Thuế'],
    ] as const;

    cases.forEach(([tileId, expected]) => {
      const panel = getOrientedTilePanelLayoutForTileSize(getBoardTileLayout(tileId)!.size, 'BOTTOM');
      const presentation = getTileTextPresentation(tileState[tileId], tileState[tileId].streetName, panel);
      if (tileId !== 12) expect(presentation.value).toBe(expected);
      if (tileId === 12) expect(presentation.value.split('\n')).toHaveLength(2);
      expect(presentation.footer).toBe(true);
      expect(presentation.region).toBe('footer');
      expect(presentation.positionZ).toBeCloseTo(panel.footerCenterLocalZ);
      expect(presentation.fontSize).toBeGreaterThanOrEqual(0.23);
    });
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
    expect(left.footer).toBe(true);
    expect(top.footer).toBe(true);
    expect(left.positionZ).toBeCloseTo(leftPanel.footerCenterLocalZ);
    expect(top.positionZ).toBeCloseTo(topPanel.footerCenterLocalZ);
  });

  it('removes jail and go-to-jail text so their icons carry the meaning', () => {
    expect(shouldRenderTileText(tileState[10].tileType)).toBe(false);
    expect(shouldRenderTileText(tileState[30].tileType)).toBe(false);
    expect(shouldRenderTileText(tileState[0].tileType)).toBe(false);
    expect(shouldRenderTileText(tileState[20].tileType)).toBe(false);
    expect(shouldRenderTileText(tileState[5].tileType)).toBe(true);
  });
});
