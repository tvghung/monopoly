import {
  GO_REWARD,
  RAILROAD_RENT_BY_COUNT,
  UTILITY_RENT_MULTIPLIER_BOTH,
  UTILITY_RENT_MULTIPLIER_SINGLE,
  type Tile,
} from '@monopoly/shared';
import { formatMoney } from '../formatters';
import type { Language } from '../../../i18n/I18n';
import { translate } from '../../../i18n/I18n';

export interface TileDetail {
  label: string;
  value?: string;
}

export function getTileDetails(tile: Tile, language: Language = 'vi'): TileDetail[] {
  const t = (key: Parameters<typeof translate>[0], values?: Readonly<Record<string, string | number>>) => translate(key, language, values);
  if (tile.tileType === 'normal') {
    const rentDetails = (tile.rentTiers ?? []).map((rent, index) => ({
      label: index === 4 ? t('property.hotelTier') : index === 0 ? t('property.houseTierOne') : t('property.houseTier', { count: index + 1 }),
      value: formatMoney(rent),
    }));
    return [
      ...(typeof tile.rent === 'number'
        ? [{ label: t('property.baseRent'), value: formatMoney(tile.rent) }]
        : []),
      ...rentDetails,
      ...(typeof tile.houseCost === 'number'
        ? [{ label: t('property.houseCost'), value: formatMoney(tile.houseCost) }]
        : []),
    ];
  }

  if (tile.tileType === 'railroad') {
    return RAILROAD_RENT_BY_COUNT.map((rent, index) => ({
      label: t('property.stationsOwned', { count: index + 1 }),
      value: formatMoney(rent),
    }));
  }

  if (tile.tileType === 'company') {
    return [
      { label: t('property.oneUtility'), value: t('property.diceTotal', { multiplier: UTILITY_RENT_MULTIPLIER_SINGLE }) },
      { label: t('property.bothUtilities'), value: t('property.diceTotal', { multiplier: UTILITY_RENT_MULTIPLIER_BOTH }) },
    ];
  }

  if (tile.tileType === 'expense') {
    // Display text for the existing shared value; the amount is charged by the server, not computed here.
    return typeof tile.expenseAmount === 'number'
      ? [{ label: t('property.taxLanding', { amount: formatMoney(tile.expenseAmount) }) }]
      : [];
  }
  if (tile.tileType === 'chance') {
    return [{ label: t('property.drawChance') }];
  }
  if (tile.tileType === 'chest') {
    return [{ label: t('property.drawChest') }];
  }
  if (tile.tileType === 'start') {
    return [{ label: t('property.startReward', { amount: formatMoney(GO_REWARD) }) }];
  }
  if (tile.tileType === 'jail') {
    return [{ label: t('property.jailVisit') }];
  }
  if (tile.tileType === 'gojail') {
    return [{ label: t('property.goToJail') }];
  }
  if (tile.tileType === 'parking') {
    return [{ label: t('property.parking') }];
  }
  return [];
}

/**
 * Which row of `getTileDetails(tile)` is in force for the current owner: a street shows the row for its development level
 * (base rent, then 1 to 4 Nhà, then the hotel), a railroad or a utility the row for how many of its kind the owner holds.
 * Returns null when the tile has no rent ladder. Shared by the inspection dialog and the deed card.
 */
export function getCurrentRentDetailIndex(
  tile: Tile,
  details: readonly TileDetail[],
  ownership: { houses: number; sameTypeOwned: number },
): number | null {
  if (details.length === 0) return null;
  if (tile.tileType === 'normal') return Math.min(Math.max(ownership.houses, 0), details.length - 1);
  if (tile.tileType === 'railroad' || tile.tileType === 'company') {
    return Math.min(Math.max(ownership.sameTypeOwned, 1), details.length) - 1;
  }
  return null;
}
