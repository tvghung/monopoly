import type { Tile, TileType } from '@monopoly/shared';
import type { BoardMaterialProfile } from '../materials/boardMaterialSpecs';

export type DistrictSurfaceKey =
  | 'oldTownStone'
  | 'harborCeramic'
  | 'coolGranite'
  | 'terracottaBrick'
  | 'metroConcrete'
  | 'sandstoneTerrazzo'
  | 'ecoSlate'
  | 'premiumBrownStone';

export type DistrictSurfacePattern =
  | 'cobble'
  | 'ceramic'
  | 'granite'
  | 'brick'
  | 'concrete'
  | 'terrazzo'
  | 'slate'
  | 'slab';

export type DistrictSurfaceEmblem =
  | 'heritage'
  | 'harbor'
  | 'boutique'
  | 'market'
  | 'skyline'
  | 'marquee'
  | 'leaf'
  | 'landmark';

export interface DistrictSurfaceDescriptor {
  surfaceKey: DistrictSurfaceKey;
  pattern: DistrictSurfacePattern;
  emblem: DistrictSurfaceEmblem;
  baseColor: string;
  secondaryColor: string;
  groutColor: string;
  accentColor: string;
  materialProfile: Extract<
    BoardMaterialProfile,
    'districtStone' | 'districtBrick' | 'districtConcrete' | 'districtPremium'
  >;
  bumpScale: number;
  patternScale: number;
}

const PROPERTY_DESCRIPTORS: Record<string, DistrictSurfaceDescriptor> = {
  brown: {
    surfaceKey: 'oldTownStone', pattern: 'cobble', emblem: 'heritage',
    baseColor: '#b9a181', secondaryColor: '#d6c2a1', groutColor: '#74614e',
    accentColor: '#6f3b2b', materialProfile: 'districtStone', bumpScale: 0.09, patternScale: 6,
  },
  lightblue: {
    surfaceKey: 'harborCeramic', pattern: 'ceramic', emblem: 'harbor',
    baseColor: '#b8d8d8', secondaryColor: '#dbe9e5', groutColor: '#789da1',
    accentColor: '#13a9c4', materialProfile: 'districtStone', bumpScale: 0.045, patternScale: 5,
  },
  pink: {
    surfaceKey: 'coolGranite', pattern: 'granite', emblem: 'boutique',
    baseColor: '#9da5aa', secondaryColor: '#c1c6c8', groutColor: '#626b70',
    accentColor: '#cc3d95', materialProfile: 'districtStone', bumpScale: 0.06, patternScale: 8,
  },
  orange: {
    surfaceKey: 'terracottaBrick', pattern: 'brick', emblem: 'market',
    baseColor: '#a8573c', secondaryColor: '#7d3f32', groutColor: '#d3aa86',
    accentColor: '#f06b21', materialProfile: 'districtBrick', bumpScale: 0.11, patternScale: 7,
  },
  red: {
    surfaceKey: 'metroConcrete', pattern: 'concrete', emblem: 'skyline',
    baseColor: '#5d6265', secondaryColor: '#828789', groutColor: '#363a3c',
    accentColor: '#cf3345', materialProfile: 'districtConcrete', bumpScale: 0.07, patternScale: 6,
  },
  yellow: {
    surfaceKey: 'sandstoneTerrazzo', pattern: 'terrazzo', emblem: 'marquee',
    baseColor: '#d6c79d', secondaryColor: '#eee3be', groutColor: '#aa9668',
    accentColor: '#d6a417', materialProfile: 'districtStone', bumpScale: 0.055, patternScale: 8,
  },
  green: {
    surfaceKey: 'ecoSlate', pattern: 'slate', emblem: 'leaf',
    baseColor: '#66776e', secondaryColor: '#8b9b91', groutColor: '#3e4c45',
    accentColor: '#15935c', materialProfile: 'districtStone', bumpScale: 0.085, patternScale: 6,
  },
  blue: {
    surfaceKey: 'premiumBrownStone', pattern: 'slab', emblem: 'landmark',
    baseColor: '#745f50', secondaryColor: '#a18a74', groutColor: '#40352e',
    accentColor: '#3559c7', materialProfile: 'districtPremium', bumpScale: 0.05, patternScale: 5,
  },
};

const SPECIAL_TILE_LABELS: Partial<Record<TileType, string>> = {
  start: 'ĐIỂM KHỞI ĐẦU',
  jail: 'NHÀ TÙ / THĂM TÙ',
  gojail: 'VÀO TÙ',
  chance: 'CƠ HỘI',
  chest: 'KHÍ VẬN',
  railroad: 'GA TÀU',
  company: 'CÔNG TY',
  expense: 'THUẾ / PHÍ',
  parking: 'BÃI ĐỖ XE',
};

const FALLBACK_DESCRIPTOR = PROPERTY_DESCRIPTORS.brown;

export const CANONICAL_PROPERTY_GROUPS = Object.freeze(Object.keys(PROPERTY_DESCRIPTORS));
export const DISTRICT_SURFACE_KEYS = Object.freeze(
  CANONICAL_PROPERTY_GROUPS.map(group => PROPERTY_DESCRIPTORS[group].surfaceKey),
) as readonly DistrictSurfaceKey[];

const DESCRIPTORS_BY_SURFACE_KEY = new Map(
  CANONICAL_PROPERTY_GROUPS.map(group => {
    const descriptor = PROPERTY_DESCRIPTORS[group];
    return [descriptor.surfaceKey, descriptor] as const;
  }),
);

export function getPropertyVisualDescriptor(
  rawColor: string | null | undefined,
): DistrictSurfaceDescriptor {
  if (!rawColor) return FALLBACK_DESCRIPTOR;
  return PROPERTY_DESCRIPTORS[rawColor.toLowerCase()] ?? FALLBACK_DESCRIPTOR;
}

export function getDistrictSurfaceDescriptor(
  tile: Tile,
): DistrictSurfaceDescriptor | undefined {
  if (tile.tileType !== 'normal') return undefined;
  return getPropertyVisualDescriptor(tile.color);
}

export function getDistrictSurfaceDescriptorByKey(
  surfaceKey: DistrictSurfaceKey,
): DistrictSurfaceDescriptor {
  return DESCRIPTORS_BY_SURFACE_KEY.get(surfaceKey) ?? FALLBACK_DESCRIPTOR;
}

export function getSpecialTileLabel(tileType: TileType): string {
  return SPECIAL_TILE_LABELS[tileType] ?? 'Ô CỜ';
}
