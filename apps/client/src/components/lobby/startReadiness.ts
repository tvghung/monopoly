import {
  getAppearanceCombinationKey,
  TEAM_2V2_PLAYER_COUNT,
  TEAM_IDS,
  TEAM_SIZE,
  type GameMode,
} from '@monopoly/shared';
import type { LobbyPlayerView } from './lobbyTypes';
import type { Language } from '../../i18n/I18n';
import { translate } from '../../i18n/I18n';

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
  language: Language = 'vi',
): string | null {
  const t = (key: Parameters<typeof translate>[0], values?: Readonly<Record<string, string | number>>) => translate(key, language, values);
  if (mode === 'TEAM_2V2') {
    if (players.length !== TEAM_2V2_PLAYER_COUNT) return t('lobby.reason.teamPlayers', { count: TEAM_2V2_PLAYER_COUNT });
    if (TEAM_IDS.some(teamId => players.filter(player => player.teamId === teamId).length !== TEAM_SIZE)) {
      return t('lobby.reason.teamSize', { count: TEAM_SIZE });
    }
  } else {
    if (players.length < minPlayers) return t('lobby.reason.minimum', { count: minPlayers });
    if (players.length > maxPlayers) return t('lobby.reason.maximum', { count: maxPlayers });
  }
  if (players.some(player => !player.ready)) return t('lobby.reason.ready');
  if (players.some(player => player.characterId === null)) return t('lobby.reason.mascot');
  if (players.some(player => !player.connected)) return t('lobby.reason.disconnected');
  if (mode === 'TEAM_2V2' && teammatesShareMascot(players)) return t('lobby.reason.duplicateTeammate');
  if (!hasUniqueAppearances(players)) return t('lobby.reason.duplicateAppearance');
  return null;
}
