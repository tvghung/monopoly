import {
  TEAM_2V2_PLAYER_COUNT,
  TEAM_IDS,
  TEAM_SIZE,
  TEAM_SLOTS,
  type GameState,
  type PlayerId,
  type TeamId,
  type TeamSlot,
} from '@monopoly/shared';
import { activePlayerIds, type RoomSnapshot } from './rooms';

/**
 * Pure lobby rules for 2v2 teams (no sockets, no persistence). The socket handlers decide who may do what and map a refusal
 * to a typed error; everything here only reads or edits the draft the caller owns.
 */

/** The active players of a team in seat order (join order breaks a tie, which only a legacy lobby can have). */
export const activeTeamMembers = (room: RoomSnapshot, state: GameState, teamId: TeamId): PlayerId[] => (
  activePlayerIds(room)
    .filter((playerId) => state.players[playerId]?.teamId === teamId)
    .sort((left, right) => state.players[left].teamSlot - state.players[right].teamSlot)
);

/**
 * Gives every team's active members the seats 0, 1 in their current seat order (join order breaks a tie). A replayed room
 * starts every member on seat 0, so this is what lays the lobby out again; in a healthy lobby it changes nothing.
 */
export const normalizeTeamSlots = (room: RoomSnapshot, state: GameState): void => {
  for (const teamId of TEAM_IDS) {
    activeTeamMembers(room, state, teamId).forEach((playerId, index) => {
      state.players[playerId].teamSlot = TEAM_SLOTS[Math.min(index, TEAM_SLOTS.length - 1)];
    });
  }
};

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

/** Forgets every open seat-swap request that involves one of `playerIds` (they moved, left or were removed). */
export const dropSeatSwapRequestsOf = (state: GameState, playerIds: readonly PlayerId[]): void => {
  state.boardState.seatSwapRequests = state.boardState.seatSwapRequests.filter((request) => (
    !playerIds.includes(request.requesterPlayerId) && !playerIds.includes(request.targetPlayerId)
  ));
};

/**
 * What a change of team means for the players who made it: everyone wears their team's colour again, a mascot that now clashes
 * with the new teammate is cleared (the player who stayed keeps theirs) and the movers must ready up again. A change of seat
 * inside the same team touches none of this.
 */
const settleTeamChange = (room: RoomSnapshot, state: GameState, movedPlayerIds: readonly PlayerId[]): void => {
  applyTeamColors(room, state);
  const stayers = activePlayerIds(room).filter((playerId) => !movedPlayerIds.includes(playerId));
  dedupeTeamMascots(room, state, [...stayers, ...movedPlayerIds]);
  resetReady(room, movedPlayerIds);
};

/** The player takes an empty seat. Their open requests (made or received) are void: nobody sits where they used to. */
export const movePlayerToSeat = (
  room: RoomSnapshot,
  state: GameState,
  playerId: PlayerId,
  teamId: TeamId,
  teamSlot: TeamSlot,
): void => {
  const player = state.players[playerId];
  const teamChanged = player.teamId !== teamId;
  player.teamId = teamId;
  player.teamSlot = teamSlot;
  dropSeatSwapRequestsOf(state, [playerId]);
  if (teamChanged) settleTeamChange(room, state, [playerId]);
};

/** The two players exchange seats (and so teams, when they are on different ones). Every open request of either is void. */
export const swapPlayerSeats = (
  room: RoomSnapshot,
  state: GameState,
  firstPlayerId: PlayerId,
  secondPlayerId: PlayerId,
): void => {
  const first = state.players[firstPlayerId];
  const second = state.players[secondPlayerId];
  const teamChanged = first.teamId !== second.teamId;
  [first.teamId, second.teamId] = [second.teamId, first.teamId];
  [first.teamSlot, second.teamSlot] = [second.teamSlot, first.teamSlot];
  dropSeatSwapRequestsOf(state, [firstPlayerId, secondPlayerId]);
  if (teamChanged) settleTeamChange(room, state, [firstPlayerId, secondPlayerId]);
};
