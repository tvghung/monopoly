import type { RoomPlayerMeta, RoomRole, TeamId } from '@monopoly/shared';

export type PlayerStationSlot = 'BOTTOM' | 'TOP' | 'LEFT' | 'RIGHT';

const opponentSlots = (count: number): PlayerStationSlot[] => {
  if (count <= 1) return ['TOP'];
  if (count === 2) return ['TOP', 'LEFT'];
  return ['TOP', 'LEFT', 'RIGHT'];
};

/**
 * 2v2: each team gets one side of the screen so the grouping reads at a glance. The corners are lower-left (BOTTOM), upper-left
 * (LEFT), upper-right (TOP) and lower-right (RIGHT), so the viewer's own team takes the left column (the viewer lower, their
 * teammate above) and the opposing team the right column. A spectator sees Team 1 on the left.
 */
const OWN_TEAM_SLOTS: readonly PlayerStationSlot[] = ['BOTTOM', 'LEFT'];
const OPPOSING_TEAM_SLOTS: readonly PlayerStationSlot[] = ['TOP', 'RIGHT'];

function resolveTeamStationSlots(
  ordered: readonly RoomPlayerMeta[],
  viewerPlayerId: string | null,
  role: RoomRole | null,
): Map<string, PlayerStationSlot> {
  const result = new Map<string, PlayerStationSlot>();
  const local = role === 'PLAYER' && viewerPlayerId
    ? ordered.find(player => player.playerId === viewerPlayerId)
    : undefined;
  const ownTeamId: TeamId = local?.teamId ?? 'TEAM_1';
  const own = ordered.filter(player => player.teamId === ownTeamId);
  if (local) own.sort((left, right) => Number(right === local) - Number(left === local));
  const opposing = ordered.filter(player => player.teamId !== ownTeamId);
  own.forEach((player, index) => {
    const slot = OWN_TEAM_SLOTS[index];
    if (slot) result.set(player.playerId, slot);
  });
  opposing.forEach((player, index) => {
    const slot = OPPOSING_TEAM_SLOTS[index];
    if (slot) result.set(player.playerId, slot);
  });
  return result;
}

/** Stable for the match because room roster joinOrder remains durable after exit. */
export function resolvePlayerStationSlots(
  roomPlayers: readonly RoomPlayerMeta[],
  viewerPlayerId: string | null,
  role: RoomRole | null,
  teamMode = false,
): Map<string, PlayerStationSlot> {
  const ordered = [...roomPlayers]
    .sort((left, right) => left.joinOrder - right.joinOrder || left.playerId.localeCompare(right.playerId))
    .slice(0, 4);
  if (teamMode) return resolveTeamStationSlots(ordered, viewerPlayerId, role);

  const result = new Map<string, PlayerStationSlot>();
  const local = role === 'PLAYER' && viewerPlayerId
    ? ordered.find(player => player.playerId === viewerPlayerId)
    : undefined;
  if (local) {
    result.set(local.playerId, 'BOTTOM');
    const localIndex = ordered.indexOf(local);
    [...ordered.slice(localIndex + 1), ...ordered.slice(0, localIndex)]
      .forEach((player, index) => result.set(player.playerId, opponentSlots(ordered.length - 1)[index]));
    return result;
  }

  if (ordered.length === 1) result.set(ordered[0].playerId, 'BOTTOM');
  if (ordered.length >= 2) {
    result.set(ordered[0].playerId, 'BOTTOM');
    ordered.slice(1).forEach((player, index) => (
      result.set(player.playerId, opponentSlots(ordered.length - 1)[index])
    ));
  }
  return result;
}
