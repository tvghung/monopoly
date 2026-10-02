import type {
  CharacterId,
  PlayerColorId,
  PublicGameState,
  RoomPlayerMeta,
  RoomRole,
} from '@monopoly/shared';
import {
  colorGroups,
  RAILROAD_TILE_INDICES,
  UTILITY_TILE_INDICES,
} from '@monopoly/shared';
import type { PresentationState } from '../../presentation/store/types';
import { resolvePlayerStationSlots, type PlayerStationSlot } from '../stations/stationSlots';
import { selectPlayerHudViewModels } from './playerHudSelectors';

/** The eight buildable districts in board order; railroads and utilities are counted separately. */
export const PLAYER_CARD_GROUPS = ['brown', 'lightblue', 'pink', 'orange', 'red', 'yellow', 'green', 'blue'] as const;
export type PlayerCardGroup = typeof PLAYER_CARD_GROUPS[number];

export interface PlayerCardGroupPips {
  group: PlayerCardGroup;
  total: number;
  owned: number;
  /** The player owns every tile of the district (a monopoly). */
  complete: boolean;
}

export interface PlayerCardViewModel {
  playerId: string;
  /** Screen corner slot; `null` for a player outside the first four seats. */
  slot: PlayerStationSlot | null;
  name: string;
  color: PlayerColorId;
  characterId: CharacterId | null;
  /** Presentation balance when there is one, otherwise the authoritative balance. */
  displayMoney: number;
  /** Follows `displayActivePlayerId`, never the authoritative current player. */
  isActive: boolean;
  isLocal: boolean;
  isConnected: boolean;
  isBankrupt: boolean;
  hasLeft: boolean;
  isInJail: boolean;
  /** Opponent rounds elapsed while in jail (0 to 2), only meaningful when `isInJail`. */
  jailRoundsElapsed: number;
  jailFreeCardCount: number;
  groupPips: PlayerCardGroupPips[];
  /** Houses (levels 1 to 4) and hotels (level 5) as the 3D scene shows them. */
  houses: number;
  hotels: number;
  propertyCount: number;
  railroadCount: number;
  utilityCount: number;
  /** ISO deadline while this player's turn is waiting for a disconnected player to return. */
  recoveryDeadlineAt: string | null;
}

const RAILROADS: ReadonlySet<number> = new Set(RAILROAD_TILE_INDICES);
const UTILITIES: ReadonlySet<number> = new Set(UTILITY_TILE_INDICES);

/**
 * Everything a player card shows, derived from committed state plus presentation state. Money, the active
 * turn and building counts follow the presentation layer so the HUD never runs ahead of the 3D scene;
 * ownership follows the authoritative `ownedProps` (a tile changes hands when the state says so).
 */
export function selectPlayerCardViewModels(
  state: PublicGameState,
  presentation: Pick<PresentationState, 'displayActivePlayerId' | 'displayBalances' | 'displayDevelopmentLevels'>,
  roomPlayers: readonly RoomPlayerMeta[],
  localPlayerId: string | null,
  role: RoomRole | null,
): PlayerCardViewModel[] {
  const activePlayerId = presentation.displayActivePlayerId ?? state.boardState.currentPlayer.id;
  const slots = resolvePlayerStationSlots(roomPlayers, localPlayerId, role);
  const recovery = state.boardState.turnRecovery;
  const ownedTilesByPlayer = new Map<string, number[]>();
  Object.entries(state.boardState.ownedProps).forEach(([tileId, property]) => {
    const tiles = ownedTilesByPlayer.get(property.id) ?? [];
    tiles.push(Number(tileId));
    ownedTilesByPlayer.set(property.id, tiles);
  });

  return selectPlayerHudViewModels(state, activePlayerId, roomPlayers).map(hud => {
    const ownedTiles = ownedTilesByPlayer.get(hud.playerId) ?? [];
    const owned = new Set(ownedTiles);
    let houses = 0;
    let hotels = 0;
    ownedTiles.forEach(tileId => {
      const level = presentation.displayDevelopmentLevels[tileId] ?? state.boardState.ownedProps[tileId].houses;
      if (level >= 5) hotels += 1;
      else houses += Math.max(0, level);
    });
    return {
      playerId: hud.playerId,
      slot: slots.get(hud.playerId) ?? null,
      name: hud.name,
      color: hud.color,
      characterId: hud.characterId,
      displayMoney: presentation.displayBalances[hud.playerId] ?? hud.money,
      isActive: hud.isCurrentTurn,
      isLocal: role === 'PLAYER' && localPlayerId === hud.playerId,
      isConnected: hud.isConnected,
      isBankrupt: hud.isBankrupt,
      hasLeft: hud.hasLeft,
      isInJail: hud.isInJail,
      jailRoundsElapsed: state.players[hud.playerId]?.jailOpponentRoundsElapsed ?? 0,
      jailFreeCardCount: hud.jailFreeCardCount,
      groupPips: PLAYER_CARD_GROUPS.map(group => {
        const tiles = colorGroups[group];
        const ownedInGroup = tiles.filter(tileId => owned.has(tileId)).length;
        return {
          group,
          total: tiles.length,
          owned: ownedInGroup,
          complete: ownedInGroup === tiles.length,
        };
      }),
      houses,
      hotels,
      propertyCount: ownedTiles.length,
      railroadCount: ownedTiles.filter(tileId => RAILROADS.has(tileId)).length,
      utilityCount: ownedTiles.filter(tileId => UTILITIES.has(tileId)).length,
      recoveryDeadlineAt: recovery && recovery.playerId === hud.playerId ? recovery.deadlineAt : null,
    };
  });
}
