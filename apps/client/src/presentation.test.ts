import { tileState } from '@monopoly/shared';
import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  getTileName,
  localizeAckError,
} from './presentation';

describe('Vietnamese presentation helpers', () => {
  it('formats game units as thousands of VND', () => {
    expect(formatMoney(60)).toBe('60.000 ₫');
    expect(formatMoney(200)).toBe('200.000 ₫');
    expect(formatMoney(1500)).toBe('1.500.000 ₫');
  });

  it('uses the canonical 40-tile shared board and Vietnamese special labels', () => {
    expect(tileState).toHaveLength(40);
    expect(getTileName(0)).toBe('Xuất Phát');
    expect(getTileName(2)).toBe('Khí Vận');
    expect(getTileName(7)).toBe('Cơ Hội');
    expect(getTileName(10)).toBe('Nhà Tù / Thăm Tù');
    expect(getTileName(30)).toBe('Vào Tù');
    expect(getTileName(38)).toBe('Thuế Xa Xỉ');
  });

  it('does not expose an English ACK message to players', () => {
    expect(localizeAckError({
      code: 'ROOM_FULL',
      message: 'Room is full.',
    })).toBe('Phòng đã đủ người chơi.');

    expect(localizeAckError({
      code: 'CONFLICT',
      message: 'Giao dịch chưa thể thực hiện.',
    })).toBe('Giao dịch chưa thể thực hiện.');
  });
});
