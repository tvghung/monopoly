import type {
  CharacterId,
  PlayerColorId,
  PublicGameState,
  RoomPlayerMeta,
} from '@monopoly/shared';

export interface PlayerHudViewModel {
  playerId: string;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  money: number;
  propertyCount: number;
  houseCount: number;
  hotelCount: number;
  isCurrentTurn: boolean;
  isConnected: boolean;
  isBankrupt: boolean;
  hasLeft: boolean;
  isInJail: boolean;
  jailFreeCardCount: number;
}

function countDevelopment(state: PublicGameState, playerId: string): { propertyCount: number; houseCount: number; hotelCount: number } {
  return Object.values(state.boardState.ownedProps).reduce((counts, property) => {
    if (property.id !== playerId) return counts;
    counts.propertyCount += 1;
    if (property.houses === 5) counts.hotelCount += 1;
    else counts.houseCount += Math.max(0, property.houses);
    return counts;
  }, { propertyCount: 0, houseCount: 0, hotelCount: 0 });
}

export function selectPlayerHudViewModels(
  state: PublicGameState,
  activePlayerId: string,
  roomPlayers: readonly RoomPlayerMeta[] = [],
): PlayerHudViewModel[] {
  const roomOrder = new Map(roomPlayers.map(player => [player.playerId, player]));
  const playerIds = new Set([
    ...roomPlayers.filter(player => player.membershipStatus === 'ACTIVE').map(player => player.playerId),
    ...Object.keys(state.players),
    ...Object.keys(state.boardState.finishedPlayers),
  ]);

  return [...playerIds]
    .map(playerId => {
      const player = state.players[playerId];
      const finished = state.boardState.finishedPlayers[playerId];
      const meta = roomOrder.get(playerId);
      const development = countDevelopment(state, playerId);
      const hasLeft = finished?.reason === 'LEFT' || meta?.membershipStatus === 'LEFT';
      const isBankrupt = finished?.reason === 'BANKRUPT';
      return {
        playerId,
        name: player?.name ?? finished?.name ?? meta?.name ?? 'Người chơi',
        color: player?.color ?? finished?.color ?? meta?.color ?? 'cyan',
        characterId: player?.characterId ?? finished?.characterId ?? meta?.characterId ?? null,
        money: player?.accountBalance ?? finished?.accountBalance ?? 0,
        ...development,
        isCurrentTurn: activePlayerId === playerId,
        isConnected: !hasLeft && (meta?.connected ?? true),
        isBankrupt,
        hasLeft,
        isInJail: player?.isJail ?? false,
        jailFreeCardCount: player?.getOutOfJailCardCount ?? 0,
      };
    })
    .sort((left, right) => {
      const leftOrder = roomOrder.get(left.playerId)?.joinOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = roomOrder.get(right.playerId)?.joinOrder ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.name.localeCompare(right.name);
    });
}
