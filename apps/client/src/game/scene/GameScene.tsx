import { Canvas } from '@react-three/fiber';
import Board3D from './board/Board3D';
import type { BoardRenderModel } from './board/boardRenderModel';
import { boardVisualTokens } from './board/boardVisualTokens';
import {
  DEFAULT_CAMERA_FOV,
  getCameraPosition,
} from './camera/cameraMath';
import FixedBoardCamera from './camera/FixedBoardCamera';
import './GameScene.css';

export interface GameSceneProps {
  model?: BoardRenderModel;
  hoveredTileId?: number | null;
  selectedTileId?: number | null;
  onTileHover?: (tileId: number | null) => void;
  onTileSelect?: (tileId: number) => void;
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
        dpr={[1, 1.25]}
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
        <FixedBoardCamera />
        <Board3D
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
