import type { CharacterPlayerModel } from '../board/boardRenderModel';

export interface CharacterOccupant {
  player: CharacterPlayerModel;
  slotIndex: number;
  occupantCount: number;
}

function compareCharacterPlayers(left: CharacterPlayerModel, right: CharacterPlayerModel): number {
  return left.joinOrder - right.joinOrder || left.playerId.localeCompare(right.playerId);
}

export function assignCharacterSlots(players: readonly CharacterPlayerModel[]): CharacterOccupant[] {
  const playersByTile = new Map<number, CharacterPlayerModel[]>();
  players.forEach(player => {
    const occupants = playersByTile.get(player.tileId) ?? [];
    occupants.push(player);
    playersByTile.set(player.tileId, occupants);
  });

  return [...playersByTile.entries()]
    .sort(([leftTileId], [rightTileId]) => leftTileId - rightTileId)
    .flatMap(([, occupants]) => {
      const ordered = occupants.slice().sort(compareCharacterPlayers);
      return ordered.map((player, slotIndex) => ({
        player,
        slotIndex,
        occupantCount: ordered.length,
      }));
    });
}
