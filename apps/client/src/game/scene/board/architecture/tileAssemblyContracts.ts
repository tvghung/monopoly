export const TILE_ASSEMBLY_LAYER_ORDER = [
  'TileTextLayer',
  'TileOwnershipLayer',
  'TileDevelopmentLayer',
  'TileSpecialLayer',
  'TileFxAnchor',
] as const;

export const TILE_TRANSFORM_CONTRACT = Object.freeze({
  worldTranslation: 'TileAnchor',
  boardSideRotation: 'TileAnchor',
  pressAnimation: 'TilePressRoot',
  childCoordinates: 'tile-local',
});
