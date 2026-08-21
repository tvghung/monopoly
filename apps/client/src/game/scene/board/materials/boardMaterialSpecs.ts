export type BoardMaterialProfile =
  | 'boardBody'
  | 'boardEdge'
  | 'boardTop'
  | 'tileBody'
  | 'tileTop'
  | 'tileChassis'
  | 'districtStone'
  | 'districtBrick'
  | 'districtConcrete'
  | 'districtPremium'
  | 'centerWell'
  | 'parkGround'
  | 'propertyTrim'
  | 'houseWall'
  | 'houseRoof'
  | 'hotel'
  | 'diceBody'
  | 'metal'
  | 'foliage'
  | 'water'
  | 'parkPath';

export interface BoardMaterialSpec {
  roughness: number;
  metalness: number;
  emissiveIntensity?: number;
}

export const boardMaterialSpecs: Record<BoardMaterialProfile, BoardMaterialSpec> = {
  boardBody: { roughness: 0.62, metalness: 0.02 },
  boardEdge: { roughness: 0.44, metalness: 0.04 },
  boardTop: { roughness: 0.7, metalness: 0 },
  tileBody: { roughness: 0.5, metalness: 0.01 },
  tileTop: { roughness: 0.58, metalness: 0 },
  tileChassis: { roughness: 0.66, metalness: 0.015 },
  districtStone: { roughness: 0.78, metalness: 0 },
  districtBrick: { roughness: 0.88, metalness: 0 },
  districtConcrete: { roughness: 0.83, metalness: 0 },
  districtPremium: { roughness: 0.56, metalness: 0.025 },
  centerWell: { roughness: 0.74, metalness: 0 },
  parkGround: { roughness: 0.9, metalness: 0 },
  propertyTrim: { roughness: 0.3, metalness: 0.05 },
  houseWall: { roughness: 0.48, metalness: 0 },
  houseRoof: { roughness: 0.36, metalness: 0.02 },
  hotel: { roughness: 0.3, metalness: 0.04 },
  diceBody: { roughness: 0.3, metalness: 0.02 },
  metal: { roughness: 0.24, metalness: 0.7 },
  foliage: { roughness: 0.76, metalness: 0 },
  water: { roughness: 0.12, metalness: 0.08 },
  parkPath: { roughness: 0.8, metalness: 0 },
};

export function getBoardMaterialProps(
  profile: BoardMaterialProfile,
  color: string,
): { color: string; roughness: number; metalness: number; emissiveIntensity?: number } {
  return { color, ...boardMaterialSpecs[profile] };
}
