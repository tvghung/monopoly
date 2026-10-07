import {
  colorGroups,
  RAILROAD_TILE_INDICES,
  UTILITY_TILE_INDICES,
  type PublicGameState,
} from '@monopoly/shared';
import { getPropertyGroupVisualStyle, type VisualTheme } from '../propertyVisualColors';
import type { Language } from '../../../i18n/I18n';
import { translate } from '../../../i18n/I18n';

export interface PortfolioGroup {
  /** The district key (`brown` ... `blue`), `railroad` or `utility`. */
  key: string;
  label: string;
  /** The district color, for the swatch next to the label. */
  color: string;
  /** The tiles of this group the player owns, in board order. */
  tileIds: number[];
  /** How many tiles the whole group has. */
  total: number;
  /** A street district with every tile owned by this player (railroads and utilities are never "complete" here). */
  complete: boolean;
}

export interface PortfolioModel {
  groups: PortfolioGroup[];
  properties: number;
  /** Houses (levels 1 to 4) and hotels (level 5), counted from authoritative ownership. */
  houses: number;
  hotels: number;
}

interface GroupSeed {
  key: string;
  tiles: readonly number[];
  street: boolean;
}

/** Street districts in board order, then railroads and utilities (the same grouping the deed card uses). */
const GROUP_SEEDS: readonly GroupSeed[] = [
  ...Object.entries(colorGroups).map(([key, tiles]) => ({ key, tiles, street: true })),
  { key: 'railroad', tiles: RAILROAD_TILE_INDICES, street: false },
  { key: 'utility', tiles: UTILITY_TILE_INDICES, street: false },
];

/**
 * Everything the portfolio dialogs show about one player's holdings, from authoritative `ownedProps`: the tiles grouped by
 * district (only groups the player has a tile in) and the counts. A player who went bankrupt or left owns nothing.
 */
export function buildPortfolioModel(
  state: PublicGameState,
  ownerId: string,
  theme?: VisualTheme,
  language: Language = 'vi',
): PortfolioModel {
  const { ownedProps } = state.boardState;
  const groups: PortfolioGroup[] = [];
  let houses = 0;
  let hotels = 0;

  GROUP_SEEDS.forEach(({ key, tiles, street }) => {
    const tileIds = tiles.filter(tileId => ownedProps[tileId]?.id === ownerId);
    if (tileIds.length === 0) return;
    tileIds.forEach(tileId => {
      const level = ownedProps[tileId].houses;
      if (level === 5) hotels += 1;
      else houses += Math.max(0, level);
    });
    const visual = getPropertyGroupVisualStyle(key, theme);
    const groupLabels: Record<string, Parameters<typeof translate>[0]> = {
      brown: 'property.colorGroup.brown', lightblue: 'property.colorGroup.lightblue', pink: 'property.colorGroup.pink',
      orange: 'property.colorGroup.orange', red: 'property.colorGroup.red', yellow: 'property.colorGroup.yellow',
      green: 'property.colorGroup.green', blue: 'property.colorGroup.blue', railroad: 'property.group.railroad', utility: 'property.group.utility',
    };
    groups.push({
      key,
      label: key in groupLabels ? translate(groupLabels[key], language) : visual.label,
      color: visual.color,
      tileIds,
      total: tiles.length,
      complete: street && tileIds.length === tiles.length,
    });
  });

  return {
    groups,
    properties: groups.reduce((sum, group) => sum + group.tileIds.length, 0),
    houses,
    hotels,
  };
}
