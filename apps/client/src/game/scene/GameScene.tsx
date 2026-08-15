import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Vector2 } from 'three';
import Board3D from './board/Board3D';
import type { BoardRenderModel } from './board/boardRenderModel';
import { boardVisualTokens } from './board/boardVisualTokens';
import {
  DEFAULT_CAMERA_FOV,
  getCameraPosition,
} from './camera/cameraMath';
import FixedBoardCamera from './camera/FixedBoardCamera';
import { getTileTextureAnisotropy } from './board/tileTexture';
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
  const width = useThree(state => state.size.width);
  const height = useThree(state => state.size.height);

  useEffect(() => {
    if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') {
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      const drawingBufferSize = gl.getDrawingBufferSize(new Vector2());
      console.info('[own-the-block-renderer]', JSON.stringify({
        pixelRatio: gl.getPixelRatio(),
        drawingBuffer: { width: drawingBufferSize.x, height: drawingBufferSize.y },
        cameraPosition: camera.position.toArray(),
        anisotropy: getTileTextureAnisotropy(gl.capabilities.getMaxAnisotropy()),
        textureMaxAnisotropy: gl.capabilities.getMaxAnisotropy(),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activityKey, camera, gl, height, hoveredTileId, selectedTileId, width]);

  return null;
}

function BoardSceneContents({
  model,
  hoveredTileId,
  selectedTileId,
  onTileHover,
  onTileSelect,
}: BoardSceneContentsProps) {
  const gl = useThree(state => state.gl);
  const textureAnisotropy = getTileTextureAnisotropy(gl.capabilities.getMaxAnisotropy());
  const activityKey = model?.players.map(player => `${player.playerId}:${player.tileId}`).join('|') ?? '';

  return (
    <>
      <FixedBoardCamera />
      <RendererDiagnostics
        activityKey={activityKey}
        hoveredTileId={hoveredTileId}
        selectedTileId={selectedTileId}
      />
      <Board3D
        model={model}
        textureAnisotropy={textureAnisotropy}
        hoveredTileId={hoveredTileId}
        selectedTileId={selectedTileId}
        onTileHover={onTileHover}
        onTileSelect={onTileSelect}
      />
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
          fov: DEFAULT_CAMERA_FOV,
          near: 0.1,
          far: 100,
          position: getCameraPosition(1),
        }}
        dpr={[1.25, 1.5]}
        frameloop="demand"
        shadows={false}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
      >
        <color attach="background" args={[boardVisualTokens.sceneBackground]} />
        <hemisphereLight
          args={['#fff8e2', '#9fd6c4', 1.8]}
        />
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
