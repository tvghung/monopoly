import { formatMoney as formatSharedMoney, tileState } from '@monopoly/shared';
import type { AckError, TileType } from '@monopoly/shared';
import type { Language } from '../../i18n/I18n';
import { translate } from '../../i18n/I18n';

export const formatMoney = formatSharedMoney;

const specialTileKeys: Partial<Record<TileType, Parameters<typeof translate>[0]>> = {
  start: 'board.go',
  chest: 'board.communityChest',
  chance: 'board.chance',
  jail: 'board.jail',
  gojail: 'board.goToJail',
  parking: 'board.freeParking',
};

export function getTileName(tileId: number, language: Language = 'vi'): string {
  const tile = tileState[tileId];
  if (!tile) return translate('board.tileNumber', language, { tileId });
  const specialKey = specialTileKeys[tile.tileType];
  if (specialKey) return translate(specialKey, language);
  if (tileId === 4) return translate('board.incomeTax', language);
  if (tileId === 38) return translate('board.luxuryTax', language);
  if (tileId === 12) return translate('board.electricCompany', language);
  if (tileId === 28) return translate('board.waterWorks', language);
  if (tile.tileType === 'railroad') {
    const place = tile.streetName.replace(/^Ga\s+/u, '');
    return language === 'en' ? translate('board.station', language, { place }) : tile.streetName;
  }
  return tile.streetName.trim() || translate('board.tileNumber', language, { tileId });
}

/** Compact display label for the 3D board; full localized names remain available to accessibility and detail views. */
export function getTileBoardName(tileId: number, language: Language = 'vi'): string {
  const tile = tileState[tileId];
  if (!tile || tile.tileType === 'normal' || tile.tileType === 'company') return getTileName(tileId, language);
  const shortKeyByType: Partial<Record<TileType, Parameters<typeof translate>[0]>> = {
    start: 'board.short.start',
    jail: 'board.short.jail',
    gojail: 'board.short.goToJail',
    chance: 'board.short.chance',
    chest: 'board.short.chest',
    railroad: 'board.short.station',
    expense: 'board.short.expense',
    parking: 'board.short.parking',
  };
  const key = shortKeyByType[tile.tileType];
  return key ? translate(key, language) : getTileName(tileId, language);
}

const ackErrorKeys: Record<AckError['code'], Parameters<typeof translate>[0]> = {
  INVALID_REQUEST: 'ack.INVALID_REQUEST',
  UNAUTHENTICATED: 'ack.UNAUTHENTICATED',
  FORBIDDEN: 'ack.FORBIDDEN',
  NOT_FOUND: 'ack.NOT_FOUND',
  CONFLICT: 'ack.CONFLICT',
  ROOM_FULL: 'ack.ROOM_FULL',
  ROOM_GONE: 'ack.ROOM_GONE',
  GAME_ALREADY_STARTED: 'ack.GAME_ALREADY_STARTED',
  SESSION_INVALID: 'ack.SESSION_INVALID',
  SESSION_REVOKED: 'ack.SESSION_REVOKED',
  SESSION_EXPIRED: 'ack.SESSION_EXPIRED',
  SESSION_REPLACED: 'ack.SESSION_REPLACED',
  UPGRADE_REQUIRED: 'ack.UPGRADE_REQUIRED',
  DATABASE_UNAVAILABLE: 'ack.DATABASE_UNAVAILABLE',
  INTERNAL_ERROR: 'ack.INTERNAL_ERROR',
};

export function localizeAckError(error: Pick<AckError, 'code' | 'message'>, language: Language = 'vi'): string {
  return translate(ackErrorKeys[error.code], language);
}
