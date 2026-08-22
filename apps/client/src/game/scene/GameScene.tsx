import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import Board3D from './board/Board3D';
import type { BoardRenderModel } from './board/boardRenderModel';
import { boardVisualTokens } from './board/boardVisualTokens';
import { getOrthographicCameraPosition } from './camera/cameraMath';
import FixedBoardCamera from './camera/FixedBoardCamera';
import {
  HARD_TRIANGLE_LIMIT,
  STRESS_DRAW_CALL_LIMIT,
  TARGET_DRAW_CALLS,
  TARGET_TRIANGLES,
  estimateSceneTriangles,
  getTileTextureAnisotropy,
} from './board/architecture/sceneBudget';
import TileMotionProvider from './board/motion/TileMotionProvider';
import './GameScene.css';
import type { PhysicalCardInteraction } from './cards/PhysicalCardDecks';
import type { DeckCounts } from '@monopoly/shared';

export interface GameSceneProps {
  model?: BoardRenderModel;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onTileHover?: (tileId: number | null) => void;
  onTileSelect?: (tileId: number) => void;
  cardInteraction?: PhysicalCardInteraction;
}

interface BoardSceneContentsProps extends GameSceneProps {
  model?: BoardRenderModel;
}

function RendererDiagnostics({
  activityKey,
  activeAnimatedObjects,
  stationCount,
  deckCounts,
  activeCardStage,
  hoveredTileId,
  selectedTileId,
}: {
  activityKey: string;
  activeAnimatedObjects: number;
  stationCount: number;
  deckCounts: DeckCounts;
  activeCardStage: BoardRenderModel['cardPresentation'] extends infer Signal
    ? Signal extends { stage: infer Stage } ? Stage : null
    : null;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
}) {
  const camera = useThree(state => state.camera);
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const invalidate = useThree(state => state.invalidate);

  useEffect(() => {
    const localDiagnostics = window.location.hostname === '127.0.0.1'
      || window.location.hostname === 'localhost'
      || new URLSearchParams(window.location.search).get('phase4-uat') === '1';
    if (!localDiagnostics) {
      return undefined;
    }
    let firstFrame = 0;
    let measurementFrame = 0;
    const publish = () => {
      const drawingBufferSize = gl.getDrawingBufferSize(new THREE.Vector2());
      const sceneObjects: THREE.Object3D[] = [];
      scene.traverse(object => sceneObjects.push(object));
      const stationBases = scene.getObjectByName('PlayerStationLowerBases');
      const sharedCoins = scene.getObjectByName('SharedStationAndBankCoins');
      const chanceCards = scene.getObjectByName('chanceCardBodies');
      const chestCards = scene.getObjectByName('chestCardBodies');
      const diagnostics = {
        pixelRatio: gl.getPixelRatio(),
        drawingBuffer: { width: drawingBufferSize.x, height: drawingBufferSize.y },
        camera: 'orthographic',
        cameraPosition: camera.position.toArray(),
        toneMapping: 'ACESFilmicToneMapping',
        shadows: 'contact',
        anisotropy: getTileTextureAnisotropy(gl.capabilities.getMaxAnisotropy()),
        textureMaxAnisotropy: gl.capabilities.getMaxAnisotropy(),
        drawCalls: gl.info.render.calls,
        triangles: estimateSceneTriangles(scene),
        activeAnimatedObjects,
        targetDrawCalls: TARGET_DRAW_CALLS,
        stressDrawCallLimit: STRESS_DRAW_CALL_LIMIT,
        targetTriangles: TARGET_TRIANGLES,
        hardTriangleLimit: HARD_TRIANGLE_LIMIT,
        physicalScene: {
          stationLayer: Boolean(scene.getObjectByName('PlayerStationLayer')),
          stationCount: stationBases instanceof THREE.InstancedMesh ? stationBases.count : 0,
          authoritativeStationCount: stationCount,
          stationLabelCount: sceneObjects.filter(object => object.name.startsWith('PlayerStationName:')).length,
          bankTreasury: Boolean(scene.getObjectByName('BankTreasury')),
          sharedCoinInstanceCount: sharedCoins instanceof THREE.InstancedMesh ? sharedCoins.count : 0,
          decks: {
            chance: {
              physicalCount: chanceCards instanceof THREE.InstancedMesh ? chanceCards.count : 0,
              authoritativeCount: deckCounts.chance,
            },
            chest: {
              physicalCount: chestCards instanceof THREE.InstancedMesh ? chestCards.count : 0,
              authoritativeCount: deckCounts.chest,
            },
          },
          activeCardStage,
          cardFocusScrim: Boolean(scene.getObjectByName('PhysicalCardFocusScrim')),
        },
      };
      window.__OWN_THE_BLOCK_RENDERER_DIAGNOSTICS__ = diagnostics;
      window.dispatchEvent(new CustomEvent('own-the-block-renderer', { detail: diagnostics }));
      console.info('[own-the-block-renderer]', JSON.stringify(diagnostics));
    };
    const measureAfterRender = () => {
      invalidate();
      firstFrame = window.requestAnimationFrame(() => {
        measurementFrame = window.requestAnimationFrame(publish);
      });
    };
    measureAfterRender();
    const settledMeasurement = window.setTimeout(measureAfterRender, 650);
    return () => {
      window.clearTimeout(settledMeasurement);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(measurementFrame);
    };
  }, [activeAnimatedObjects, activeCardStage, activityKey, camera, deckCounts.chance, deckCounts.chest, gl, height, hoveredTileId, invalidate, scene, selectedTileId, stationCount, width]);

  return null;
}

function BoardSceneContents({
  model,
  hoveredTileId,
  selectedTileId,
  onTileHover,
  onTileSelect,
  cardInteraction,
}: BoardSceneContentsProps) {
  const latestMovementByPlayer = new Map<string, BoardRenderModel['characterMovements'][number]>();
  model?.characterMovements.forEach(signal => latestMovementByPlayer.set(signal.playerId, signal));
  const activeMovementCount = [...latestMovementByPlayer.values()]
    .filter(signal => signal.phase === 'START').length;
  const developmentObjects = model?.developmentChanges.reduce((count, signal) => {
    if (signal.durationMs <= 0 || signal.direction === 'DOWN') return count;
    const added = signal.toHouses === 5
      ? 5
      : Math.max(0, Math.min(4, signal.toHouses) - Math.min(4, signal.fromHouses));
    return count + added * 5;
  }, 0) ?? 0;
  const activeAnimatedObjects = activeMovementCount
    + (model?.dice.phase === 'ROLLING' ? 2 : 0)
    + (model?.destinationPreview ? 1 : 0)
    + (model?.moneyTransfers.at(-1)?.coinCount ?? 0)
    + (model?.cardPresentation?.stage === 'DRAWING'
      || model?.cardPresentation?.stage === 'REVEALING' ? 1 : 0)
    + developmentObjects;
  const activityKey = [
    model?.players.map(player => `${player.playerId}:${player.tileId}`).join('|') ?? '',
    model?.tileImpacts.at(-1)?.sequence ?? 0,
    model?.moneyTransfers.at(-1)?.sequence ?? 0,
    model?.developmentChanges.at(-1)?.sequence ?? 0,
    model?.cardPresentation?.stage ?? '',
    model?.destinationPreview?.id ?? '',
  ].join('|');

  return (
    <>
      <FixedBoardCamera />
      <RendererDiagnostics
        activityKey={activityKey}
        activeAnimatedObjects={activeAnimatedObjects}
        stationCount={model?.stations.length ?? 0}
        deckCounts={model?.deckCounts ?? { chance: 0, chest: 0 }}
        activeCardStage={model?.cardPresentation?.stage ?? null}
        hoveredTileId={hoveredTileId}
        selectedTileId={selectedTileId}
      />
      <TileMotionProvider
        impacts={model?.tileImpacts ?? []}
        resetEpoch={model?.presentationResetEpoch ?? 0}
      >
        <Board3D
          model={model}
          hoveredTileId={hoveredTileId}
          selectedTileId={selectedTileId}
          onTileHover={onTileHover}
          onTileSelect={onTileSelect}
          cardInteraction={cardInteraction}
        />
      </TileMotionProvider>
    </>
  );
}

export default function GameScene({
  model,
  hoveredTileId,
  selectedTileId,
  onTileHover,
  onTileSelect,
  cardInteraction,
}: GameSceneProps) {
  return (
    <div className="game-scene" data-testid="game-scene">
      <Canvas
        camera={{
          near: 0.1,
          far: 100,
          position: getOrthographicCameraPosition(),
        }}
        orthographic
        dpr={[1.25, 1.5]}
        frameloop="demand"
        shadows={false}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1,
        }}
      >
        <color attach="background" args={[boardVisualTokens.sceneBackground]} />
        <hemisphereLight args={['#fff8e2', '#9fd6c4', 1.8]} />
        <directionalLight
          position={[8, 14, 7]}
          intensity={1.7}
          color="#fff8e8"
        />
        <BoardSceneContents
          model={model}
          hoveredTileId={hoveredTileId}
          selectedTileId={selectedTileId}
          onTileHover={onTileHover}
          onTileSelect={onTileSelect}
          cardInteraction={cardInteraction}
        />
      </Canvas>
    </div>
  );
}
