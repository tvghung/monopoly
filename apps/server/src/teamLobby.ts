import {
  TEAM_2V2_PLAYER_COUNT,
  TEAM_IDS,
  TEAM_SIZE,
  type GameState,
  type PlayerId,
  type TeamId,
} from '@monopoly/shared';
import { activePlayerIds, type RoomSnapshot } from './rooms';

/**
 * Pure lobby rules for 2v2 teams (no sockets, no persistence). The socket handlers decide who may do what and map a refusal
 * to a typed error; everything here only reads or edits the draft the caller owns.
 */

/** The active players of a team, in join order. */
export const activeTeamMembers = (room: RoomSnapshot, state: GameState, teamId: TeamId): PlayerId[] => (
  activePlayerIds(room).filter((playerId) => state.players[playerId]?.teamId === teamId)
);

export const activeTeamSizes = (room: RoomSnapshot, state: GameState): Record<TeamId, number> => ({
  TEAM_1: activeTeamMembers(room, state, 'TEAM_1').length,
  TEAM_2: activeTeamMembers(room, state, 'TEAM_2').length,
});

export const resetReady = (room: RoomSnapshot, playerIds: readonly PlayerId[]): void => {
  for (const playerId of playerIds) {
    const member = room.members[playerId];
    if (member) member.ready = false;
  }
};

/** Every active player wears the colour of their team (2v2 only: Solo colours are personal). */
export const applyTeamColors = (room: RoomSnapshot, state: GameState): void => {
  for (const playerId of activePlayerIds(room)) {
    const player = state.players[playerId];
    if (player) player.color = state.boardState.teams[player.teamId].color;
  }
};

/**
 * Two members of a team share its colour, so they may not share a mascot. Walks `priority` (highest first) and, per team,
 * clears the mascot of any player whose mascot an earlier player of the same team already uses. Returns the players whose
 * mascot was cleared; they must pick another before they can be ready again.
 */
export const dedupeTeamMascots = (
  room: RoomSnapshot,
  state: GameState,
  priority: readonly PlayerId[],
): PlayerId[] => {
  const cleared: PlayerId[] = [];
  const usedByTeam: Record<TeamId, Set<string>> = { TEAM_1: new Set(), TEAM_2: new Set() };
  for (const playerId of priority) {
    const player = state.players[playerId];
    if (!player || room.members[playerId]?.membershipStatus !== 'ACTIVE' || player.characterId === null) continue;
    const used = usedByTeam[player.teamId];
    if (used.has(player.characterId)) {
      player.characterId = null;
      cleared.push(playerId);
    } else {
      used.add(player.characterId);
    }
  }
  return cleared;
};

/** True when another active member of the player's team already uses this mascot. */
export const hasTeamMascotConflict = (
  room: RoomSnapshot,
  state: GameState,
  playerId: PlayerId,
  characterId: string | null,
): boolean => {
  const player = state.players[playerId];
  if (!player || characterId === null) return false;
  return activeTeamMembers(room, state, player.teamId).some((otherId) => (
    otherId !== playerId && state.players[otherId]?.characterId === characterId
  ));
};

/**
 * Why a 2v2 game cannot start yet from the team point of view, or `null`. Ready, connection and mascot-chosen checks are the
 * same as for Solo and live in the start handler; this covers exactly 4 players, exactly 2 per team, distinct team colours,
 * every player in their team's colour and no shared mascot inside a team.
 */
export const getTeamStartBlockReason = (room: RoomSnapshot, state: GameState): string | null => {
  const players = activePlayerIds(room);
  if (players.length !== TEAM_2V2_PLAYER_COUNT) {
    return `Chế độ 2v2 cần đúng ${TEAM_2V2_PLAYER_COUNT} người chơi.`;
  }
  const sizes = activeTeamSizes(room, state);
  if (TEAM_IDS.some((teamId) => sizes[teamId] !== TEAM_SIZE)) {
    return `Mỗi đội phải có đúng ${TEAM_SIZE} người chơi.`;
  }
  const { teams } = state.boardState;
  if (teams.TEAM_1.color === teams.TEAM_2.color) return 'Hai đội đang dùng cùng một màu.';
  if (players.some((playerId) => state.players[playerId].color !== teams[state.players[playerId].teamId].color)) {
    return 'Màu mascot phải trùng màu của đội.';
  }
  for (const playerId of players) {
    const characterId = state.players[playerId].characterId;
    if (hasTeamMascotConflict(room, state, playerId, characterId)) {
      return 'Hai đồng đội đang trùng mascot.';
    }
  }
  return null;
};
