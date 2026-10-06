import {
  getAppearanceCombinationKey,
  TEAM_2V2_PLAYER_COUNT,
  TEAM_IDS,
  TEAM_SIZE,
  type GameMode,
} from '@monopoly/shared';
import type { LobbyPlayerView } from './lobbyTypes';

function hasUniqueAppearances(players: readonly LobbyPlayerView[]): boolean {
  const keys = players
    .map(player => getAppearanceCombinationKey(player.characterId, player.color))
    .filter((key): key is string => key !== null);
  return new Set(keys).size === keys.length;
}

/** Two teammates share the team colour, so they cannot also share a mascot. */
function teammatesShareMascot(players: readonly LobbyPlayerView[]): boolean {
  return TEAM_IDS.some(teamId => {
    const mascots = players
      .filter(player => player.teamId === teamId && player.characterId !== null)
      .map(player => player.characterId);
    return new Set(mascots).size !== mascots.length;
  });
}

/**
 * Why the host cannot start yet, or `null` when the lobby may start. These are the client checks that disable "Bắt đầu"
 * (the server stays authoritative); the reasons come in the order a host can act on them, and the first one wins. In 2v2 the
 * lobby needs exactly four players, two on each team.
 */
export function getStartBlockReason(
  players: readonly LobbyPlayerView[],
  minPlayers: number,
  maxPlayers: number,
  mode: GameMode = 'SOLO',
): string | null {
  if (mode === 'TEAM_2V2') {
    if (players.length !== TEAM_2V2_PLAYER_COUNT) return `Chế độ 2v2 cần đúng ${TEAM_2V2_PLAYER_COUNT} người chơi`;
    if (TEAM_IDS.some(teamId => players.filter(player => player.teamId === teamId).length !== TEAM_SIZE)) {
      return `Mỗi đội cần đúng ${TEAM_SIZE} người chơi`;
    }
  } else {
    if (players.length < minPlayers) return `Cần ít nhất ${minPlayers} người chơi`;
    if (players.length > maxPlayers) return `Tối đa ${maxPlayers} người chơi`;
  }
  if (players.some(player => !player.ready)) return 'Chờ mọi người sẵn sàng';
  if (players.some(player => player.characterId === null)) return 'Có người chưa chọn mascot';
  if (players.some(player => !player.connected)) return 'Có người đang mất kết nối';
  if (mode === 'TEAM_2V2' && teammatesShareMascot(players)) return 'Hai đồng đội đang trùng mascot';
  if (!hasUniqueAppearances(players)) return 'Hai người đang trùng mascot và màu';
  return null;
}
