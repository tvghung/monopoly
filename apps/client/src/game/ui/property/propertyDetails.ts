import {
  GO_REWARD,
  RAILROAD_RENT_BY_COUNT,
  UTILITY_RENT_MULTIPLIER_BOTH,
  UTILITY_RENT_MULTIPLIER_SINGLE,
  type Tile,
} from '@monopoly/shared';
import { formatMoney } from '../formatters';

export interface TileDetail {
  label: string;
  value?: string;
}

export function getTileDetails(tile: Tile): TileDetail[] {
  if (tile.tileType === 'normal') {
    const rentDetails = (tile.rentTiers ?? []).map((rent, index) => ({
      label: index === 4 ? 'Có Khách Sạn' : `Có ${index + 1} Nhà`,
      value: formatMoney(rent),
    }));
    return [
      ...(typeof tile.rent === 'number'
        ? [{ label: 'Tiền thuê cơ bản', value: formatMoney(tile.rent) }]
        : []),
      ...rentDetails,
      ...(typeof tile.houseCost === 'number'
        ? [{ label: 'Giá mỗi Nhà / Khách Sạn', value: formatMoney(tile.houseCost) }]
        : []),
    ];
  }

  if (tile.tileType === 'railroad') {
    return RAILROAD_RENT_BY_COUNT.map((rent, index) => ({
      label: `Sở hữu ${index + 1} Ga Tàu`,
      value: formatMoney(rent),
    }));
  }

  if (tile.tileType === 'company') {
    return [
      { label: 'Sở hữu 1 Công Ty', value: `Tổng xúc xắc ×${UTILITY_RENT_MULTIPLIER_SINGLE}` },
      { label: 'Sở hữu cả 2 Công Ty', value: `Tổng xúc xắc ×${UTILITY_RENT_MULTIPLIER_BOTH}` },
    ];
  }

  if (tile.tileType === 'expense') {
    // Display text for the existing shared value; the amount is charged by the server, not computed here.
    return typeof tile.expenseAmount === 'number'
      ? [{ label: `Nộp ${formatMoney(tile.expenseAmount)} cho Ngân hàng khi dừng tại đây.` }]
      : [];
  }
  if (tile.tileType === 'chance') {
    return [{ label: 'Rút thẻ Cơ Hội trên cùng và thực hiện nội dung trên thẻ.' }];
  }
  if (tile.tileType === 'chest') {
    return [{ label: 'Rút thẻ Khí Vận trên cùng và thực hiện nội dung trên thẻ.' }];
  }
  if (tile.tileType === 'start') {
    return [{ label: `Đi qua hoặc dừng tại đây nhận ${formatMoney(GO_REWARD)}.` }];
  }
  if (tile.tileType === 'jail') {
    return [{ label: 'Người đang thăm tù vẫn tiếp tục lượt bình thường.' }];
  }
  if (tile.tileType === 'gojail') {
    return [{ label: 'Đi thẳng vào Nhà Tù và không nhận tiền khi qua Xuất Phát.' }];
  }
  if (tile.tileType === 'parking') {
    return [{ label: 'Không nhận thưởng; lượt chơi tiếp tục theo luật thông thường.' }];
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
