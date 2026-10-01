import { getAppearanceCombinationKey } from '@monopoly/shared';
import type { LobbyPlayerView } from './lobbyTypes';

function hasUniqueAppearances(players: readonly LobbyPlayerView[]): boolean {
  const keys = players
    .map(player => getAppearanceCombinationKey(player.characterId, player.color))
    .filter((key): key is string => key !== null);
  return new Set(keys).size === keys.length;
}

/**
 * Why the host cannot start yet, or `null` when the lobby may start. These are the client checks that disable "Bắt đầu"
 * (the server stays authoritative); the reasons come in the order a host can act on them, and the first one wins.
 */
export function getStartBlockReason(
  players: readonly LobbyPlayerView[],
  minPlayers: number,
  maxPlayers: number,
): string | null {
  if (players.length < minPlayers) return `Cần ít nhất ${minPlayers} người chơi`;
  if (players.length > maxPlayers) return `Tối đa ${maxPlayers} người chơi`;
  if (players.some(player => !player.ready)) return 'Chờ mọi người sẵn sàng';
  if (players.some(player => player.characterId === null)) return 'Có người chưa chọn mascot';
  if (players.some(player => !player.connected)) return 'Có người đang mất kết nối';
  if (!hasUniqueAppearances(players)) return 'Hai người đang trùng mascot và màu';
  return null;
}
