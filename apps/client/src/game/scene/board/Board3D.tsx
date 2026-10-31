import { useCallback, useEffect, useMemo, useState } from 'react';
import { markSceneOnce } from '../render/warmup/sceneMarks';
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
import type { TileHoverStore } from './tileHoverStore';
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
  /** Hover lives in a store (see `tileHoverStore`): a pointer crossing a tile never re-renders this component. */
  hoverStore?: TileHoverStore;
  selectedTileId?: number | null;
  onTileSelect?: (tileId: number) => void;
}

// Fallbacks for a board without a render model. Module constants, so an absent model never hands a layer a new object per render.
const NO_DICE: BoardRenderModel['dice'] = {
  dice: { dice1: 0, dice2: 0 },
  rollSequence: 0,
  phase: 'HIDDEN',
  durationMs: 0,
};
const NO_DECK_COUNTS: BoardRenderModel['deckCounts'] = { chance: 0, chest: 0 };
const NO_STATIONS: BoardRenderModel['stations'] = [];
const NO_PLAYERS: BoardRenderModel['players'] = [];
const NO_MOVEMENTS: BoardRenderModel['characterMovements'] = [];
const NO_LANDINGS: BoardRenderModel['characterLandings'] = [];
const NO_REACTIONS: BoardRenderModel['characterReactions'] = [];
const NO_MONEY_TRANSFERS: BoardRenderModel['moneyTransfers'] = [];

export default function Board3D({
  model,
  hoverStore,
  selectedTileId = null,
  onTileSelect,
}: Board3DProps) {
  markSceneOnce('board3d-render');
  useEffect(() => { markSceneOnce('board3d-mounted'); }, []);
  const { language } = useTranslation();
  const tiles = useBoardTiles(model?.tiles, language);
  // Keyed on the signal lists, not rebuilt on every render: the instanced houses re-plan only when a signal actually changes.
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
  const reducedMotion = model?.reducedMotion ?? false;
  const destinationPreview = model?.destinationPreview ?? null;
  // The houses of the whole board are three instanced meshes; if that layer ever fails the per-tile boxes take over.
  const [houseMode, setHouseMode] = useState<HouseRenderMode>('instanced');
  const fallBackToLegacyHouses = useCallback(() => setHouseMode('legacy'), []);
  // Owned here, for the scene's lifetime, so the per-move destination preview borrows them instead of linking its program anew.
  const previewMaterials = useDestinationPreviewMaterialsOwner();
  return (
    <houseRenderModeContext.Provider value={houseMode}>
    <DestinationPreviewMaterialsContext.Provider value={previewMaterials}>
    <group name="Board3D">
      <BoardFoundation />
      <TileBodyBatch
        tiles={tiles}
        powerUpTargets={model?.powerUpTargets}
        hoverStore={hoverStore}
        selectedTileId={selectedTileId}
        onSelect={onTileSelect}
      />
      <TileSurfaceBatch
        tiles={tiles}
        onHover={hoverStore?.set}
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
            selected={model?.powerUpTargets ? model.powerUpTargets.validTileIds.includes(tile.tileId) : selectedTileId === tile.tileId}
            ownershipChange={latestOwnershipChanges.get(tile.tileId)}
            developmentChange={latestDevelopmentChanges.get(tile.tileId)}
            goCrossing={tile.tileId === 0 ? latestGoCrossing : undefined}
            destinationPreview={destinationPreview?.tileId === tile.tileId ? destinationPreview : undefined}
            reducedMotion={reducedMotion}
          />
        ))}
      </group>
      {houseMode === 'instanced'
        ? (
          <OptionalSceneLayer name="tube-houses" onFail={fallBackToLegacyHouses}>
            <TubeHouseInstances
              tiles={tiles}
              developmentChanges={latestDevelopmentChanges}
              reducedMotion={reducedMotion}
            />
          </OptionalSceneLayer>
        )
        : null}
      <OptionalSceneLayer name="landmark-shadows">
        <LandmarkShadowProxy
          tiles={tiles}
          developmentChanges={latestDevelopmentChanges}
          reducedMotion={reducedMotion}
        />
      </OptionalSceneLayer>
      <CenterAirport />
      <DiceLayer model={model?.dice ?? NO_DICE} reducedMotion={reducedMotion} />
      <PhysicalCardDecks deckCounts={model?.deckCounts ?? NO_DECK_COUNTS} />
      <PlayerStationLayer stations={model?.stations ?? NO_STATIONS} />
      <MoneyTransferLayer
        moneyTransfers={model?.moneyTransfers ?? NO_MONEY_TRANSFERS}
        stations={model?.stations ?? NO_STATIONS}
      />
      <CharactersLayer
        players={model?.players ?? NO_PLAYERS}
        movementSignals={model?.characterMovements ?? NO_MOVEMENTS}
        landingSignals={model?.characterLandings ?? NO_LANDINGS}
        reactions={model?.characterReactions ?? NO_REACTIONS}
        animationSpeedMultiplier={model?.animationSpeedMultiplier ?? 1}
        resetEpoch={model?.presentationResetEpoch ?? 0}
      />
    </group>
    </DestinationPreviewMaterialsContext.Provider>
    </houseRenderModeContext.Provider>
  );
}
