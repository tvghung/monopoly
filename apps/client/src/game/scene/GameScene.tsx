import { Canvas, flushGlobalEffects, useFrame, useThree, type RootState } from '@react-three/fiber';
import { lazy, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import Board3D from './board/Board3D';
import type { BoardRenderModel } from './board/boardRenderModel';
import { boardVisualTokens } from './board/boardVisualTokens';
import PropScreenRectsPublisher from '../../dev/hud-overlap/PropScreenRectsPublisher';
import TileScreenRectsPublisher from '../../dev/hud-overlap/TileScreenRectsPublisher';
import CameraAutoFocus from './camera/CameraAutoFocus';
import FixedBoardCamera, { BOARD_CANVAS_CAMERA } from './camera/FixedBoardCamera';
import { useBoardGestures } from './camera/useBoardGestures';
import {
  HARD_TRIANGLE_LIMIT,
  STRESS_DRAW_CALL_LIMIT,
  TARGET_DRAW_CALLS,
  TARGET_TRIANGLES,
  estimateSceneTriangles,
  getTileTextureAnisotropy,
} from './board/architecture/sceneBudget';
import TileMotionProvider from './board/motion/TileMotionProvider';
import { DemandFrameScheduler } from './render/demandFrameScheduler';
import { countComposerPasses } from './render/diagnostics/composerPasses';
import { isDevToolingEnabled, isLocalDiagnosticsEnabled } from './render/diagnostics/localDiagnostics';
import { MeasurementScheduler } from './render/diagnostics/measurementScheduler';
import { FrameCounter, shadowMapTypeName, toneMappingName } from './render/diagnostics/rendererInfo';
import OptionalSceneLayer from './render/OptionalSceneLayer';
import SceneLightRig from './render/lighting/SceneLightRig';
import StudioEnvironment from './render/environment/StudioEnvironment';
import TableProps from './props/TableProps';
import BoardGroundShadow from './render/table/BoardGroundShadow';
import Tabletop from './render/table/Tabletop';
import { RenderQualityContext, useRenderQuality } from './render/RenderQualityContext';
import { probeRenderCapabilities, resolveRenderQuality } from './render/renderQuality';
import { SCENE_TONE_MAPPING, SCENE_TONE_MAPPING_EXPOSURE, parseToneMappingOverride } from './render/toneMapping';
import { useSettings } from '../../settings/selectors';
import {
  COIN_FINISH_MATERIALS,
  COIN_FINISH_ORDER,
  SHARED_COIN_GEOMETRY,
} from './stations/coinVisuals';
import './GameScene.css';
import type { DeckCounts } from '@monopoly/shared';

// The post chain only exists for the high tier: its chunk is never requested for balanced or low.
const ScenePostEffects = lazy(() => import('./render/post/ScenePostEffects'));

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

interface DiagnosticsInputs {
  activeAnimatedObjects: number;
  stationCount: number;
  deckCounts: DeckCounts;
  destinationPreviewTileId: number | null;
  qualityTier: string;
}

/**
 * Dev/UAT only (mounted by `BoardSceneContents` only when `isLocalDiagnosticsEnabled()`; a production page never mounts
 * it). It observes the scene and must not drive it: the measurement lifecycle lives in `MeasurementScheduler`, the
 * latest scene inputs are read through a ref, and a change of those inputs never asks for a frame by itself.
 */
function RendererDiagnostics({
  activeAnimatedObjects,
  stationCount,
  deckCounts,
  destinationPreviewTileId,
}: Omit<DiagnosticsInputs, 'qualityTier'>) {
  const camera = useThree(state => state.camera);
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const invalidate = useThree(state => state.invalidate);
  const counterRef = useRef<FrameCounter | null>(null);
  const quality = useRenderQuality();
  const latestRef = useRef<DiagnosticsInputs>({
    activeAnimatedObjects, stationCount, deckCounts, destinationPreviewTileId, qualityTier: quality.tier,
  });
  useEffect(() => {
    latestRef.current = {
      activeAnimatedObjects, stationCount, deckCounts, destinationPreviewTileId, qualityTier: quality.tier,
    };
  });

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
    const publish = (): boolean => {
      const counter = counterRef.current;
      // No frame has been rendered with the counter yet: the scheduler asks for a bounded number of retries.
      if (!counter || counter.stats.frameSequence === 0) return false;
      const latest = latestRef.current;
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
        qualityTier: latest.qualityTier,
        pixelRatio: gl.getPixelRatio(),
        drawingBuffer: { width: drawingBufferSize.x, height: drawingBufferSize.y },
        camera: 'orthographic',
        cameraPosition: camera.position.toArray(),
        cameraFrustum: camera instanceof THREE.OrthographicCamera
          ? {
            left: camera.left,
            right: camera.right,
            top: camera.top,
            bottom: camera.bottom,
            zoom: camera.zoom,
          }
          : null,
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
        postPasses: countComposerPasses(),
        postRenders: stats.postRenders,
        renderedTriangles: stats.mainTriangles,
        anisotropy: getTileTextureAnisotropy(gl.capabilities.getMaxAnisotropy()),
        textureMaxAnisotropy: gl.capabilities.getMaxAnisotropy(),
        drawCalls: stats.mainDrawCalls,
        triangles: estimateSceneTriangles(scene),
        combinedDrawCalls: stats.totalDrawCalls,
        combinedTriangles: estimateSceneTriangles(scene),
        activeAnimatedObjects: latest.activeAnimatedObjects,
        targetDrawCalls: TARGET_DRAW_CALLS,
        stressDrawCallLimit: STRESS_DRAW_CALL_LIMIT,
        targetTriangles: TARGET_TRIANGLES,
        hardTriangleLimit: HARD_TRIANGLE_LIMIT,
        physicalScene: {
          stationLayer: Boolean(scene.getObjectByName('PlayerStationLayer')),
          stationCount: latest.stationCount,
          authoritativeStationCount: latest.stationCount,
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
              authoritativeCount: latest.deckCounts.chance,
            },
            chest: {
              physicalCount: chestCards instanceof THREE.InstancedMesh ? chestCards.count : 0,
              authoritativeCount: latest.deckCounts.chest,
            },
          },
          destinationPreviewTileId: latest.destinationPreviewTileId,
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
      return true;
    };
    const scheduler = new MeasurementScheduler({
      invalidate: () => invalidate(),
      requestAnimationFrame: callback => window.requestAnimationFrame(callback),
      cancelAnimationFrame: id => window.cancelAnimationFrame(id),
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: id => window.clearTimeout(id),
    }, publish);
    scheduler.start();
    // Async completions (SDF text, textures) render new frames later; republish once frames go quiet.
    const unsubscribe = counterRef.current?.subscribe(stats => {
      window.__OWN_THE_BLOCK_RENDERER_FRAME_SAMPLE__?.({
        timestampMs: stats.mainRenderAtMs,
        intervalMs: stats.mainRenderIntervalMs,
        cpuMs: stats.mainRenderCpuMs,
        drawCalls: stats.mainDrawCalls,
        triangles: stats.mainTriangles,
      });
      scheduler.noteFrame();
    });
    return () => {
      unsubscribe?.();
      scheduler.dispose();
    };
  }, [camera, gl, invalidate, scene]);

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
  // Stable for the page's lifetime, so mounting the dev instrumentation conditionally never changes the hook order.
  const devTooling = isDevToolingEnabled();
  const localDiagnostics = isLocalDiagnosticsEnabled();

  return (
    <>
      <FixedBoardCamera />
      <CameraAutoFocus players={model?.players ?? NO_PLAYER_PLACES} />
      {devTooling ? <TileScreenRectsPublisher /> : null}
      {devTooling ? <PropScreenRectsPublisher /> : null}
      {localDiagnostics
        ? (
          <RendererDiagnostics
            activeAnimatedObjects={activeAnimatedObjects}
            stationCount={model?.stations.length ?? 0}
            deckCounts={model?.deckCounts ?? NO_DECK_COUNTS}
            destinationPreviewTileId={model?.destinationPreview?.tileId ?? null}
          />
        )
        : null}
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

const NO_PLAYER_PLACES: readonly { playerId: string; tileId: number }[] = [];
const NO_DECK_COUNTS: DeckCounts = { chance: 0, chest: 0 };

export default function GameScene({
  model,
  hoveredTileId,
  selectedTileId,
  onTileHover,
  onTileSelect,
  onRendererFailure,
}: GameSceneProps) {
  const { settings } = useSettings();
  const fpsLimitRef = useRef(settings.fpsLimit);
  fpsLimitRef.current = settings.fpsLimit;
  const frameSchedulerRef = useRef<DemandFrameScheduler | null>(null);
  const onCanvasCreated = useCallback((state: RootState) => {
    frameSchedulerRef.current?.dispose();
    const scheduler = new DemandFrameScheduler(fpsLimitRef.current, timestampSeconds => {
      const current = state.get();
      if (!current.internal.active || current.gl.xr.isPresenting) return;
      const timestampMs = timestampSeconds * 1_000;
      flushGlobalEffects('before', timestampMs);
      try {
        current.advance(timestampSeconds, false);
      } finally {
        flushGlobalEffects('after', timestampMs);
      }
    }, undefined, timestampMs => flushGlobalEffects('tail', timestampMs));
    const invalidate = (frames = 1) => {
      const current = state.get();
      if (current.internal.active && !current.gl.xr.isPresenting) scheduler.invalidate(frames);
    };
    state.set({ invalidate });
    frameSchedulerRef.current = scheduler;
    scheduler.invalidate();
  }, []);
  useEffect(() => {
    frameSchedulerRef.current?.setFpsLimit(settings.fpsLimit);
  }, [settings.fpsLimit]);
  useEffect(() => () => {
    frameSchedulerRef.current?.dispose();
    frameSchedulerRef.current = null;
  }, []);
  const quality = useMemo(
    () => resolveRenderQuality(settings.graphicsQuality, probeRenderCapabilities()),
    [settings.graphicsQuality],
  );
  // Comparison captures may override the tone mapper; real players always get Neutral.
  const toneMapping = useMemo(
    () => (isLocalDiagnosticsEnabled() ? parseToneMappingOverride(window.location.search) : SCENE_TONE_MAPPING),
    [],
  );
  const sceneRef = useRef<HTMLDivElement>(null);
  useBoardGestures(sceneRef);
  return (
    <div ref={sceneRef} className="game-scene" data-testid="game-scene" data-graphics-tier={quality.tier}>
      <Canvas
        camera={BOARD_CANVAS_CAMERA}
        orthographic
        dpr={[quality.dpr[0], quality.dpr[1]]}
        frameloop="never"
        onCreated={onCanvasCreated}
        shadows={quality.shadows.enabled ? 'percentage' : false}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          // The high tier applies the Neutral tone mapper in its post chain; the Canvas prop is authoritative
          // (R3F re-applies it on every render), so it has to say so or the renderer would tone map twice.
          toneMapping: quality.toneMappingInPost ? THREE.NoToneMapping : toneMapping,
          toneMappingExposure: SCENE_TONE_MAPPING_EXPOSURE,
        }}
      >
        <RenderQualityContext.Provider value={quality}>
          <RendererLifecycleGuard onFailure={onRendererFailure} />
          <color attach="background" args={[boardVisualTokens.sceneBackground]} />
          <SceneLightRig />
          <OptionalSceneLayer name="studio-environment" resetKey={quality.tier}>
            <StudioEnvironment />
          </OptionalSceneLayer>
          <OptionalSceneLayer name="tabletop" resetKey={quality.tier}>
            <Tabletop />
            <BoardGroundShadow />
          </OptionalSceneLayer>
          <OptionalSceneLayer name="table-props" resetKey={quality.tier}>
            <TableProps />
          </OptionalSceneLayer>
          {quality.postProcessing
            ? (
              <OptionalSceneLayer name="post-processing" resetKey={quality.tier}>
                <ScenePostEffects />
              </OptionalSceneLayer>
            )
            : null}
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
