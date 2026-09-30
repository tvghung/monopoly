import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
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
import { FrameCounter, shadowMapTypeName, toneMappingName } from './render/diagnostics/rendererInfo';
import { RenderQualityContext, useRenderQuality } from './render/RenderQualityContext';
import { probeRenderCapabilities, resolveRenderQuality } from './render/renderQuality';
import { useSettings } from '../../settings/selectors';
import CoinMaterialEnvironment from './stations/CoinMaterialEnvironment';
import {
  COIN_FINISH_MATERIALS,
  COIN_FINISH_ORDER,
  SHARED_COIN_GEOMETRY,
} from './stations/coinVisuals';
import './GameScene.css';
import type { DeckCounts } from '@monopoly/shared';

export interface GameSceneProps {
  model?: BoardRenderModel;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onTileHover?: (tileId: number | null) => void;
  onTileSelect?: (tileId: number) => void;
  onRendererFailure?: (error: Error) => void;
}

interface BoardSceneContentsProps extends GameSceneProps {
  model?: BoardRenderModel;
}

export function RendererLifecycleGuard({ onFailure }: { onFailure?: (error: Error) => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      onFailure?.(new Error('WebGL context was lost'));
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    return () => canvas.removeEventListener('webglcontextlost', onContextLost);
  }, [gl, onFailure]);
  return null;
}

/** Diagnostics only run on localhost or in the UAT harness; production pages pay nothing. */
function isLocalDiagnosticsEnabled(): boolean {
  return window.location.hostname === '127.0.0.1'
    || window.location.hostname === 'localhost'
    || new URLSearchParams(window.location.search).get('phase4-uat') === '1';
}

const DIAGNOSTICS_DEBOUNCE_MS = 120;

function RendererDiagnostics({
  activityKey,
  activeAnimatedObjects,
  stationCount,
  deckCounts,
  destinationPreviewTileId,
  hoveredTileId,
  selectedTileId,
}: {
  activityKey: string;
  activeAnimatedObjects: number;
  stationCount: number;
  deckCounts: DeckCounts;
  destinationPreviewTileId: number | null;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
}) {
  const camera = useThree(state => state.camera);
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);
  const invalidate = useThree(state => state.invalidate);
  const counterRef = useRef<FrameCounter | null>(null);
  const quality = useRenderQuality();

  useEffect(() => {
    if (!isLocalDiagnosticsEnabled()) return undefined;
    const counter = new FrameCounter(gl, scene);
    counterRef.current = counter;
    window.__OWN_THE_BLOCK_RENDERER_INVALIDATE__ = () => invalidate();
    return () => {
      counter.dispose();
      counterRef.current = null;
      delete window.__OWN_THE_BLOCK_RENDERER_INVALIDATE__;
    };
  }, [gl, invalidate, scene]);
  // Resets gl.info before each frame, so the counts always describe the last complete frame.
  useFrame(() => counterRef.current?.beginFrame(), -1000);

  useEffect(() => {
    if (!isLocalDiagnosticsEnabled()) {
      return undefined;
    }
    let firstFrame = 0;
    let measurementFrame = 0;
    let debounce = 0;
    const publish = () => {
      const counter = counterRef.current;
      if (!counter || counter.stats.frameSequence === 0) {
        // No frame has been rendered with the counter yet; the subscription publishes after the first one.
        invalidate();
        return;
      }
      const stats = counter.stats;
      const drawingBufferSize = gl.getDrawingBufferSize(new THREE.Vector2());
      const context = gl.getContext();
      const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
      const glRenderer = debugInfo
        ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : null;
      const destinationPreviewDiagnostics = window.__OWN_THE_BLOCK_DESTINATION_PREVIEW_DIAGNOSTICS__ ?? {};
      const sceneObjects: THREE.Object3D[] = [];
      scene.traverse(object => sceneObjects.push(object));
      const stationCoinMeshes = sceneObjects.filter(object => object.name.startsWith('StationCoins:'));
      const sharedCoinFinishInstances = Object.fromEntries(
        (['COPPER', 'SILVER', 'GOLD'] as const).map(finish => [
          finish,
          stationCoinMeshes
            .filter(object => object.name === `StationCoins:${finish}`)
            .reduce((count, object) => count + (object instanceof THREE.InstancedMesh ? object.count : 0), 0),
        ]),
      );
      const chanceCards = scene.getObjectByName('chanceCardBodies');
      const chestCards = scene.getObjectByName('chestCardBodies');
      const diagnostics = {
        glRenderer,
        qualityTier: quality.tier,
        pixelRatio: gl.getPixelRatio(),
        drawingBuffer: { width: drawingBufferSize.x, height: drawingBufferSize.y },
        camera: 'orthographic',
        cameraPosition: camera.position.toArray(),
        toneMapping: toneMappingName(gl.toneMapping),
        toneMappingExposure: gl.toneMappingExposure,
        shadows: {
          enabled: gl.shadowMap.enabled,
          type: gl.shadowMap.enabled ? shadowMapTypeName(gl.shadowMap.type) : 'none',
        },
        environment: Boolean(scene.environment),
        frameSequence: stats.frameSequence,
        mainDrawCalls: stats.mainDrawCalls,
        shadowDrawCalls: stats.shadowDrawCalls,
        postDrawCalls: stats.postDrawCalls,
        postPasses: stats.postPasses,
        renderedTriangles: stats.mainTriangles,
        anisotropy: getTileTextureAnisotropy(gl.capabilities.getMaxAnisotropy()),
        textureMaxAnisotropy: gl.capabilities.getMaxAnisotropy(),
        drawCalls: stats.mainDrawCalls,
        triangles: estimateSceneTriangles(scene),
        combinedDrawCalls: stats.totalDrawCalls,
        combinedTriangles: estimateSceneTriangles(scene),
        activeAnimatedObjects,
        targetDrawCalls: TARGET_DRAW_CALLS,
        stressDrawCallLimit: STRESS_DRAW_CALL_LIMIT,
        targetTriangles: TARGET_TRIANGLES,
        hardTriangleLimit: HARD_TRIANGLE_LIMIT,
        physicalScene: {
          stationLayer: Boolean(scene.getObjectByName('PlayerStationLayer')),
          stationCount: stationCount,
          authoritativeStationCount: stationCount,
          stationLabelCount: sceneObjects.filter(object => object.name.startsWith('PlayerStationName:')).length,
          bankTreasury: Boolean(scene.getObjectByName('BankTreasury')),
          sharedCoinInstanceCount: stationCoinMeshes.reduce(
            (count, object) => count + (object instanceof THREE.InstancedMesh ? object.count : 0),
            0,
          ),
          sharedCoinFinishInstances,
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
          destinationPreviewTileId,
          destinationPreview: destinationPreviewDiagnostics,
          coinSystem: {
            geometryType: SHARED_COIN_GEOMETRY.type,
            sceneEnvironment: Boolean(scene.environment),
            finishes: Object.fromEntries(COIN_FINISH_ORDER.map(finish => {
              const material = COIN_FINISH_MATERIALS[finish];
              return [finish, {
                metalness: material.metalness,
                roughness: material.roughness,
                envMap: Boolean(material.envMap),
                envMapIntensity: material.envMapIntensity,
              }];
            })),
          },
          activeTurnRingCount: sceneObjects.filter(object => (
            object.name.includes('ActiveTurn') || object.name.includes('PlayerActiveRing')
          )).length,
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
    // Async completions (SDF text, textures) render new frames later; republish once frames go quiet.
    const unsubscribe = counterRef.current?.subscribe(() => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(publish, DIAGNOSTICS_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe?.();
      window.clearTimeout(debounce);
      window.clearTimeout(settledMeasurement);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(measurementFrame);
    };
  }, [activeAnimatedObjects, activityKey, camera, deckCounts.chance, deckCounts.chest, destinationPreviewTileId, gl, height, hoveredTileId, invalidate, quality.tier, scene, selectedTileId, stationCount, width]);

  return null;
}

function BoardSceneContents({
  model,
  hoveredTileId,
  selectedTileId,
  onTileHover,
  onTileSelect,
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
    + developmentObjects;
  const activityKey = [
    model?.players.map(player => `${player.playerId}:${player.tileId}`).join('|') ?? '',
    model?.tileImpacts.at(-1)?.sequence ?? 0,
    model?.moneyTransfers.at(-1)?.sequence ?? 0,
    model?.developmentChanges.at(-1)?.sequence ?? 0,
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
        destinationPreviewTileId={model?.destinationPreview?.tileId ?? null}
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
  onRendererFailure,
}: GameSceneProps) {
  const { settings } = useSettings();
  const quality = useMemo(
    () => resolveRenderQuality(settings.graphicsQuality, probeRenderCapabilities()),
    [settings.graphicsQuality],
  );
  return (
    <div className="game-scene" data-testid="game-scene" data-graphics-tier={quality.tier}>
      <Canvas
        camera={{
          near: 0.1,
          far: 100,
          position: getOrthographicCameraPosition(),
        }}
        orthographic
        dpr={[quality.dpr[0], quality.dpr[1]]}
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
        <RenderQualityContext.Provider value={quality}>
        <RendererLifecycleGuard onFailure={onRendererFailure} />
        <color attach="background" args={[boardVisualTokens.sceneBackground]} />
        <hemisphereLight args={['#fff8e2', '#9fd6c4', 1.8]} />
        <directionalLight
          position={[8, 14, 7]}
          intensity={1.7}
          color="#fff8e8"
        />
        <CoinMaterialEnvironment />
        <BoardSceneContents
          model={model}
          hoveredTileId={hoveredTileId}
          selectedTileId={selectedTileId}
          onTileHover={onTileHover}
          onTileSelect={onTileSelect}
        />
        </RenderQualityContext.Provider>
      </Canvas>
    </div>
  );
}
