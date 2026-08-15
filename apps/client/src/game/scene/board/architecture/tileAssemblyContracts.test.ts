import { describe, expect, it } from 'vitest';
import { TILE_ASSEMBLY_LAYER_ORDER, TILE_TRANSFORM_CONTRACT } from './tileAssemblyContracts';

describe('tile assembly contracts', () => {
  it('keeps world translation, board rotation, and press animation on one owner each', () => {
    expect(TILE_TRANSFORM_CONTRACT).toEqual({
      worldTranslation: 'TileAnchor',
      boardSideRotation: 'TileAnchor',
      pressAnimation: 'TilePressRoot',
      childCoordinates: 'tile-local',
    });
    expect(TILE_ASSEMBLY_LAYER_ORDER).toEqual([
      'TileBodyLayer',
      'TileSurfaceLayer',
      'TileTextLayer',
      'TileOwnershipLayer',
      'TileDevelopmentLayer',
      'TileSpecialLayer',
      'TileFxAnchor',
    ]);
  });
});
