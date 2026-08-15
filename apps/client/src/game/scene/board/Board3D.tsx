import { tileState } from '@monopoly/shared';
import BoardBase from './BoardBase';
import BoardTile3D from './BoardTile3D';
import type { BoardRenderModel, BoardTileRenderModel } from './boardRenderModel';
import Phase2PlayerMarkers from '../players/Phase2PlayerMarkers';

interface Board3DProps {
  model?: BoardRenderModel;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onTileHover?: (tileId: number | null) => void;
  onTileSelect?: (tileId: number) => void;
}

export default function Board3D({
  model,
  hoveredTileId = null,
  selectedTileId = null,
  onTileHover,
  onTileSelect,
}: Board3DProps) {
  const tiles: readonly BoardTileRenderModel[] = model?.tiles ?? tileState.map((tile, tileId) => ({
    tileId,
    name: tile.streetName,
    tileType: tile.tileType,
    price: tile.price,
    propertyColor: tile.color,
    houses: 0,
  }));
  return (
    <group>
      <BoardBase />
      {tiles.map(tile => (
        <BoardTile3D
          key={tile.tileId}
          tileId={tile.tileId}
          tile={tileState[tile.tileId]}
          ownerColor={tile.ownerColor}
          houses={tile.houses}
          hovered={hoveredTileId === tile.tileId}
          selected={selectedTileId === tile.tileId}
          onHover={onTileHover}
          onSelect={onTileSelect}
        />
      ))}
      <Phase2PlayerMarkers players={model?.players ?? []} />
    </group>
  );
}
