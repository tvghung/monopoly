import { useMemo, useState } from 'react';
import { tileState } from '@monopoly/shared';
import BoardFoundation from './foundation/BoardFoundation';
import CenterAirport from './center/CenterAirport';
import TileAssembly from './tiles/TileAssembly';
import TileBodyBatch from './tiles/TileBodyBatch';
import TileSurfaceBatch from './tiles/TileSurfaceBatch';
import TileImpactHighlightBatch from './tiles/TileImpactHighlightBatch';
import {
  DestinationPreviewMaterialsContext,
  useDestinationPreviewMaterialsOwner,
} from './tiles/TileDestinationPreview';
import type { BoardRenderModel } from './boardRenderModel';
import { useBoardTiles } from './stableTiles';
import CharactersLayer from '../characters/CharactersLayer';
import DiceLayer from '../dice/DiceLayer';
import PlayerStationLayer from '../stations/PlayerStationLayer';
import MoneyTransferLayer from '../stations/MoneyTransferLayer';
import PhysicalCardDecks from '../cards/PhysicalCardDecks';
import LandmarkShadowProxy from '../buildings/LandmarkShadowProxy';
import TubeHouseInstances from '../buildings/TubeHouseInstances';
import { houseRenderModeContext, type HouseRenderMode } from '../buildings/houseRenderMode';
import OptionalSceneLayer from '../render/OptionalSceneLayer';
import { useTranslation } from '../../../i18n/I18n';

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
  const { language } = useTranslation();
  const tiles = useBoardTiles(model?.tiles, language);
  // Keyed on the signal lists, not rebuilt on every hover: the instanced houses re-plan only when a signal actually changes.
  const ownershipChanges = model?.ownershipChanges;
  const developmentChanges = model?.developmentChanges;
  const latestOwnershipChanges = useMemo(() => {
    const latest = new Map<number, BoardRenderModel['ownershipChanges'][number]>();
    ownershipChanges?.forEach(signal => latest.set(signal.tileId, signal));
    return latest;
  }, [ownershipChanges]);
  const latestDevelopmentChanges = useMemo(() => {
    const latest = new Map<number, BoardRenderModel['developmentChanges'][number]>();
    developmentChanges?.forEach(signal => latest.set(signal.tileId, signal));
    return latest;
  }, [developmentChanges]);
  const latestGoCrossing = model?.goCrossings.at(-1);
  // The houses of the whole board are three instanced meshes; if that layer ever fails the per-tile boxes take over.
  const [houseMode, setHouseMode] = useState<HouseRenderMode>('instanced');
  // Owned here, for the scene's lifetime, so the per-move destination preview borrows them instead of linking its program anew.
  const previewMaterials = useDestinationPreviewMaterialsOwner();
  return (
    <houseRenderModeContext.Provider value={houseMode}>
    <DestinationPreviewMaterialsContext.Provider value={previewMaterials}>
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
      {houseMode === 'instanced'
        ? (
          <OptionalSceneLayer name="tube-houses" onFail={() => setHouseMode('legacy')}>
            <TubeHouseInstances
              tiles={tiles}
              developmentChanges={latestDevelopmentChanges}
              reducedMotion={model?.reducedMotion ?? false}
            />
          </OptionalSceneLayer>
        )
        : null}
      <OptionalSceneLayer name="landmark-shadows">
        <LandmarkShadowProxy
          tiles={tiles}
          developmentChanges={latestDevelopmentChanges}
          reducedMotion={model?.reducedMotion ?? false}
        />
      </OptionalSceneLayer>
      <CenterAirport />
      <DiceLayer model={model?.dice ?? {
        dice: { dice1: 0, dice2: 0 },
        rollSequence: 0,
        phase: 'HIDDEN',
        durationMs: 0,
      }} reducedMotion={model?.reducedMotion ?? false} />
      <PhysicalCardDecks
        deckCounts={model?.deckCounts ?? { chance: 0, chest: 0 }}
      />
      <PlayerStationLayer stations={model?.stations ?? []} />
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
    </DestinationPreviewMaterialsContext.Provider>
    </houseRenderModeContext.Provider>
  );
}
