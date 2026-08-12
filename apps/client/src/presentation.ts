import { formatMoney as formatSharedMoney, tileState } from '@monopoly/shared';
import type { AckError, TileType } from '@monopoly/shared';

// Re-export the canonical product formatter for all client presentation code.
export const formatMoney = formatSharedMoney;

const specialTileNames: Partial<Record<TileType, string>> = {
  start: 'Xuất Phát',
  chest: 'Khí Vận',
  chance: 'Cơ Hội',
  jail: 'Nhà Tù / Thăm Tù',
  gojail: 'Vào Tù',
  parking: 'Bãi Đỗ Xe',
};

export function getTileName(tileId: number): string {
  const tile = tileState[tileId];
  if (!tile) return `Ô số ${tileId}`;

  const specialName = specialTileNames[tile.tileType];
  if (specialName) return specialName;
  if (tileId === 4) return 'Thuế Thu Nhập';
  if (tileId === 38) return 'Thuế Xa Xỉ';
  return tile.streetName.trim() || `Ô số ${tileId}`;
}

export function getMortgageValue(tileId: number): number {
  return Math.floor((tileState[tileId]?.price ?? 0) / 2);
}

// Mirrors the server's voluntary-transfer rule for a player-facing preview.
// The server remains authoritative when the trade is accepted or purchased.
export function getMortgageTransferSurcharge(tileId: number): number {
  return Math.ceil(((tileState[tileId]?.price ?? 0) / 2) * 0.1);
}

const ackErrorMessages: Record<AckError['code'], string> = {
  INVALID_REQUEST: 'Yêu cầu không hợp lệ. Vui lòng kiểm tra thông tin và thử lại.',
  UNAUTHENTICATED: 'Bạn chưa được xác thực. Vui lòng vào lại phòng.',
  FORBIDDEN: 'Bạn không có quyền thực hiện hành động này.',
  NOT_FOUND: 'Không tìm thấy phòng hoặc dữ liệu được yêu cầu.',
  CONFLICT: 'Không thể thực hiện hành động ở trạng thái hiện tại.',
  ROOM_FULL: 'Phòng đã đủ người chơi.',
  ROOM_GONE: 'Phòng này không còn tồn tại.',
  GAME_ALREADY_STARTED: 'Ván chơi đã bắt đầu; bạn có thể vào với vai trò khán giả.',
  SESSION_INVALID: 'Phiên kết nối lại không hợp lệ.',
  SESSION_REVOKED: 'Phiên chơi đã bị thu hồi.',
  SESSION_EXPIRED: 'Phiên vào phòng đã hết hạn.',
  SESSION_REPLACED: 'Phiên chơi này đã được mở trên một kết nối mới hơn.',
  UPGRADE_REQUIRED: 'Phiên bản trò chơi đã thay đổi. Vui lòng tải lại trang.',
  DATABASE_UNAVAILABLE: 'Máy chủ dữ liệu tạm thời không khả dụng. Vui lòng thử lại.',
  INTERNAL_ERROR: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại.',
};

const vietnameseCharacters = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

export function localizeAckError(error: Pick<AckError, 'code' | 'message'>): string {
  // Keep a detailed server message once the server has been localized; otherwise
  // never expose an English transport/domain message in the Vietnamese client.
  return vietnameseCharacters.test(error.message)
    ? error.message
    : ackErrorMessages[error.code];
}
