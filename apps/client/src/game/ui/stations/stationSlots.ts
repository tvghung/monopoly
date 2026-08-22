import type { RoomPlayerMeta, RoomRole } from '@monopoly/shared';

export type PlayerStationSlot = 'BOTTOM' | 'TOP' | 'LEFT' | 'RIGHT';

const opponentSlots = (count: number): PlayerStationSlot[] => {
  if (count <= 1) return ['TOP'];
  if (count === 2) return ['TOP', 'LEFT'];
  return ['TOP', 'LEFT', 'RIGHT'];
};

/** Stable for the match because room roster joinOrder remains durable after exit. */
export function resolvePlayerStationSlots(
  roomPlayers: readonly RoomPlayerMeta[],
  viewerPlayerId: string | null,
  role: RoomRole | null,
): Map<string, PlayerStationSlot> {
  const ordered = [...roomPlayers]
    .sort((left, right) => left.joinOrder - right.joinOrder || left.playerId.localeCompare(right.playerId))
    .slice(0, 4);
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
