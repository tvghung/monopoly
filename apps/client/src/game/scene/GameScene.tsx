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

export interface GameSceneProps {
  model?: BoardRenderModel;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onTileHover?: (tileId: number | null) => void;
  onTileSelect?: (tileId: number) => void;
}

interface BoardSceneContentsProps extends GameSceneProps {
  model?: BoardRenderModel;
}

function RendererDiagnostics({
  activityKey,
  hoveredTileId,
  selectedTileId,
}: {
  activityKey: string;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
}) {
  const camera = useThree(state => state.camera);
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);

  useEffect(() => {
    if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      const drawingBufferSize = gl.getDrawingBufferSize(new THREE.Vector2());
      console.info('[own-the-block-renderer]', JSON.stringify({
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
        targetDrawCalls: TARGET_DRAW_CALLS,
        stressDrawCallLimit: STRESS_DRAW_CALL_LIMIT,
        targetTriangles: TARGET_TRIANGLES,
        hardTriangleLimit: HARD_TRIANGLE_LIMIT,
      }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activityKey, camera, gl, height, hoveredTileId, scene, selectedTileId, width]);

  return null;
}

function BoardSceneContents({
  model,
  hoveredTileId,
  selectedTileId,
  onTileHover,
  onTileSelect,
}: BoardSceneContentsProps) {
  const activityKey = [
    model?.players.map(player => `${player.playerId}:${player.tileId}`).join('|') ?? '',
    model?.tileImpacts.at(-1)?.sequence ?? 0,
  ].join('|');

  return (
    <>
      <FixedBoardCamera />
      <RendererDiagnostics
        activityKey={activityKey}
        hoveredTileId={hoveredTileId}
        selectedTileId={selectedTileId}
      />
      <TileMotionProvider
        impacts={model?.tileImpacts ?? []}
        impactEpoch={model?.tileImpactEpoch ?? 0}
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
        />
      </Canvas>
    </div>
  );
}
