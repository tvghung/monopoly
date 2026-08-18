import type { Tile } from '@monopoly/shared';
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
    return [25, 50, 100, 200].map((rent, index) => ({
      label: `Sở hữu ${index + 1} Ga Tàu`,
      value: formatMoney(rent),
    }));
  }

  if (tile.tileType === 'company') {
    return [
      { label: 'Sở hữu 1 Công Ty', value: 'Tổng xúc xắc ×4' },
      { label: 'Sở hữu cả 2 Công Ty', value: 'Tổng xúc xắc ×10' },
    ];
  }

  if (tile.tileType === 'chance') {
    return [{ label: 'Rút thẻ Cơ Hội trên cùng và thực hiện nội dung trên thẻ.' }];
  }
  if (tile.tileType === 'chest') {
    return [{ label: 'Rút thẻ Khí Vận trên cùng và thực hiện nội dung trên thẻ.' }];
  }
  if (tile.tileType === 'start') {
    return [{ label: `Đi qua hoặc dừng tại đây nhận ${formatMoney(200)}.` }];
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
