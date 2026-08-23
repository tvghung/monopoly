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
import PlayerStationLayer from '../stations/PlayerStationLayer';
import MoneyTransferLayer from '../stations/MoneyTransferLayer';
import PhysicalCardDecks, { type PhysicalCardInteraction } from '../cards/PhysicalCardDecks';

interface Board3DProps {
  model?: BoardRenderModel;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onTileHover?: (tileId: number | null) => void;
  onTileSelect?: (tileId: number) => void;
  cardInteraction?: PhysicalCardInteraction;
}

const inactiveCardInteraction: PhysicalCardInteraction = {
  canDraw: false,
  drawPending: false,
  onDraw: () => {},
};

export default function Board3D({
  model,
  hoveredTileId = null,
  selectedTileId = null,
  onTileHover,
  onTileSelect,
  cardInteraction = inactiveCardInteraction,
}: Board3DProps) {
  const tiles: readonly BoardTileRenderModel[] = model?.tiles ?? tileState.map((tile, tileId) => ({
    tileId,
    name: tile.streetName,
    tileType: tile.tileType,
    price: tile.price,
    propertyColor: tile.color,
    houses: 0,
  }));
  const latestOwnershipChanges = new Map<number, BoardRenderModel['ownershipChanges'][number]>();
  const latestDevelopmentChanges = new Map<number, BoardRenderModel['developmentChanges'][number]>();
  model?.ownershipChanges.forEach(signal => latestOwnershipChanges.set(signal.tileId, signal));
  model?.developmentChanges.forEach(signal => latestDevelopmentChanges.set(signal.tileId, signal));
  const latestGoCrossing = model?.goCrossings.at(-1);
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
            selected={selectedTileId === tile.tileId}
            ownershipChange={latestOwnershipChanges.get(tile.tileId)}
            developmentChange={latestDevelopmentChanges.get(tile.tileId)}
            goCrossing={tile.tileId === 0 ? latestGoCrossing : undefined}
            destinationPreview={model?.destinationPreview?.tileId === tile.tileId
              ? model.destinationPreview
              : undefined}
            reducedMotion={model?.reducedMotion ?? false}
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
      <PhysicalCardDecks
        signal={model?.cardPresentation ?? null}
        deckCounts={model?.deckCounts ?? { chance: 0, chest: 0 }}
        interaction={cardInteraction}
        renderActiveCard={false}
      />
      <PlayerStationLayer
        stations={model?.stations ?? []}
        moneyTransfers={model?.moneyTransfers ?? []}
      />
      <MoneyTransferLayer model={model} />
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
