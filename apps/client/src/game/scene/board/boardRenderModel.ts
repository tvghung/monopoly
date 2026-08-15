import type { PublicGameState, TileType } from '@monopoly/shared';
import { tileState } from '@monopoly/shared';
import type { PresentationState } from '../../presentation/store/types';
import { getTileName } from '../../../presentation';

export interface BoardTileRenderModel {
  tileId: number;
  name: string;
  tileType: TileType;
  price?: number;
  propertyColor?: string;
  ownerId?: string;
  ownerColor?: string;
  houses: number;
}

export interface Phase2PlayerMarkerModel {
  playerId: string;
  name: string;
  color: string;
  tileId: number;
  isActive: boolean;
}

export interface BoardRenderModel {
  tiles: BoardTileRenderModel[];
  players: Phase2PlayerMarkerModel[];
}

function resolveOwnerColor(
  state: PublicGameState,
  ownerId: string,
  fallbackColor: string,
): string {
  return state.players[ownerId]?.color
    ?? state.boardState.finishedPlayers[ownerId]?.color
    ?? fallbackColor;
}

export function buildBoardRenderModel(
  state: PublicGameState,
  presentationState: PresentationState,
): BoardRenderModel {
  const tiles = tileState.map((tile, tileId): BoardTileRenderModel => {
    const owned = state.boardState.ownedProps[tileId];
    return {
      tileId,
      name: getTileName(tileId),
      tileType: tile.tileType,
      ...(typeof tile.price === 'number' ? { price: tile.price } : {}),
      ...(tile.color ? { propertyColor: tile.color } : {}),
      ...(owned
        ? {
          ownerId: owned.id,
          ownerColor: resolveOwnerColor(state, owned.id, owned.color),
          houses: owned.houses,
        }
        : { houses: 0 }),
    };
  });

  const activePlayerId = presentationState.displayActivePlayerId
    ?? state.boardState.currentPlayer.id;
  const players = Object.entries(state.players)
    .map(([playerId, player]): Phase2PlayerMarkerModel => ({
      playerId,
      name: player.name,
      color: player.color,
      tileId: presentationState.displayPositions[playerId] ?? player.currentTile,
      isActive: playerId === activePlayerId,
    }));

  return { tiles, players };
}
