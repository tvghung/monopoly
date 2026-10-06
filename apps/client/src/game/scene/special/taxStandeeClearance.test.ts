import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import {
  TILE_ICON_FACE_Y_OFFSET,
} from '../board/architecture/boardArtSpec';
import {
  CHARACTER_BASE_Y,
  TILE_SURFACE_Y,
  getCharacterOccupantOffsets,
} from '../board/architecture/tileAnchors';
import { TILE_SURFACE_CLEARANCE_Y, getBoardTileLayout } from '../board/boardLayout';
import { getOrientedTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';
import { STANDEE_BASE_HEIGHT } from '../characters/standeeMaterial';
import { TAX_ART_ORIGIN_Y, createTaxVisualSpecs } from './TaxVisual';

/** Tile ids of the tax tiles, read from the shared board data (4 and 38 on the Standard board). */
const TAX_TILE_IDS = tileState
  .map((tile, index) => (tile.tileType === 'expense' ? index : -1))
  .filter(index => index >= 0);

/** The base must keep at least this much of its side visible above the tallest part of the art. */
const MIN_BASE_SHOULDER = 0.02;

function getTaxArtVerticalExtent(tileId: number): { bottom: number; top: number } {
  const layout = getBoardTileLayout(tileId)!;
  const panel = getOrientedTilePanelLayoutForTileSize(layout.size, layout.side);
  const { papers, marks } = createTaxVisualSpecs(panel);
  // Every box is only turned about the vertical axis, so its height is its vertical extent.
  const boxes = [...papers, ...marks];
  return {
    bottom: TAX_ART_ORIGIN_Y + Math.min(...boxes.map(box => box.position[1] - box.height / 2)),
    top: TAX_ART_ORIGIN_Y + Math.max(...boxes.map(box => box.position[1] + box.height / 2)),
  };
}

describe('tax art under a mascot standee', () => {
  it('finds the two tax tiles of the standard board', () => {
    expect(TAX_TILE_IDS).toEqual([4, 38]);
  });

  it.each(TAX_TILE_IDS)(
    'keeps tax tile %i lower than the round standee base so the coloured base is never covered',
    tileId => {
      const { top } = getTaxArtVerticalExtent(tileId);
      const baseTop = CHARACTER_BASE_Y + STANDEE_BASE_HEIGHT;
      // The mascot stands at the tile centre and the stack covers the centre, so the whole art must sit under the base top.
      expect(top).toBeLessThanOrEqual(baseTop - MIN_BASE_SHOULDER);
    },
  );

  it.each(TAX_TILE_IDS)('keeps tax tile %i inside the elevation contract of the other raised tile art', tileId => {
    const { bottom, top } = getTaxArtVerticalExtent(tileId);
    // Never below the surface decal plane, never taller than the shallow SVG badge face of railroad/utility/deck tiles.
    expect(bottom).toBeGreaterThanOrEqual(TILE_SURFACE_CLEARANCE_Y);
    expect(top).toBeLessThanOrEqual(TILE_SURFACE_Y + TILE_ICON_FACE_Y_OFFSET);
  });

  it.each([1, 2, 3, 4, 5, 6])('leaves the base visible above the art for every slot of %i occupants', count => {
    const { top } = getTaxArtVerticalExtent(TAX_TILE_IDS[0]);
    getCharacterOccupantOffsets(count).forEach(offset => {
      expect(offset[1] + STANDEE_BASE_HEIGHT).toBeGreaterThanOrEqual(top + MIN_BASE_SHOULDER);
    });
  });
});
