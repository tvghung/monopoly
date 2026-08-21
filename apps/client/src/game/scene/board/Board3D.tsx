import { tileState } from '@monopoly/shared';
import BoardFoundation from './foundation/BoardFoundation';
import CenterAirport from './center/CenterAirport';
import TileAssembly from './tiles/TileAssembly';
import TileBodyBatch from './tiles/TileBodyBatch';
import TileSurfaceBatch from './tiles/TileSurfaceBatch';
import TileImpactHighlightBatch from './tiles/TileImpactHighlightBatch';
import type { BoardRenderModel, BoardTileRenderModel } from './boardRenderModel';
import CharactersLayer from '../characters/CharactersLayer';
import DiceLayer from '../dice/DiceLayer';

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
    <group name="Board3D">
      <BoardFoundation />
      <TileBodyBatch
        tiles={tiles}
        hoveredTileId={hoveredTileId}
        selectedTileId={selectedTileId}
        onHover={onTileHover}
        onSelect={onTileSelect}
      />
      <TileSurfaceBatch
        tiles={tiles}
        hoveredTileId={hoveredTileId}
        selectedTileId={selectedTileId}
        onHover={onTileHover}
        onSelect={onTileSelect}
      />
      <TileImpactHighlightBatch tiles={tiles} />
      <group name="TileRing">
        {tiles.map(tile => (
          <TileAssembly
            key={tile.tileId}
            tileId={tile.tileId}
            tile={tileState[tile.tileId]}
            name={tile.name}
            ownerColor={tile.ownerColor}
            houses={tile.houses}
            hovered={hoveredTileId === tile.tileId}
            selected={selectedTileId === tile.tileId}
            onHover={onTileHover}
            onSelect={onTileSelect}
          />
        ))}
      </group>
      <CenterAirport />
      <DiceLayer model={model?.dice ?? {
        dice: { dice1: 0, dice2: 0 },
        rollSequence: 0,
        phase: 'HIDDEN',
        durationMs: 0,
      }} />
      <CharactersLayer
        players={model?.players ?? []}
        movementSignals={model?.characterMovements ?? []}
        landingSignals={model?.characterLandings ?? []}
        reactions={model?.characterReactions ?? []}
        animationSpeedMultiplier={model?.animationSpeedMultiplier ?? 1}
        resetEpoch={model?.presentationResetEpoch ?? 0}
      />
    </group>
  );
}
