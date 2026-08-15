import type { PublicGameState } from '@monopoly/shared';
import { tileState } from '@monopoly/shared';
import { formatMoney, getTileName } from '../../presentation';

export function getTileAccessibilityLabel(tileId: number, state: PublicGameState): string {
  const tile = tileState[tileId];
  const owned = state.boardState.ownedProps[tileId];
  const ownerName = owned
    ? state.players[owned.id]?.name
      ?? state.boardState.finishedPlayers[owned.id]?.name
      ?? 'người chơi khác'
    : null;
  const playersHere = Object.values(state.players)
    .filter(player => player.currentTile === tileId)
    .map(player => player.name);
  const buildingLabel = owned && owned.houses > 0
    ? owned.houses === 5 ? '1 Khách Sạn' : `${owned.houses} Nhà`
    : null;
  return [
    `Ô ${tileId}: ${getTileName(tileId)}`,
    typeof tile.price === 'number' ? `Giá ${formatMoney(tile.price)}` : null,
    ownerName ? `Chủ sở hữu: ${ownerName}` : null,
    buildingLabel ? `Có ${buildingLabel}` : null,
    playersHere.length > 0 ? `Người chơi đang đứng: ${playersHere.join(', ')}` : null,
    'Mở chi tiết ô cờ',
  ].filter(Boolean).join('. ');
}
