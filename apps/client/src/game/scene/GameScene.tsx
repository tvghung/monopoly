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
        dpr={[1, 1.5]}
        frameloop="demand"
        shadows
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
      >
        <color attach="background" args={[boardVisualTokens.sceneBackground]} />
        <hemisphereLight
          args={['#fff7e6', '#7da393', 1.8]}
        />
        <directionalLight
          castShadow
          position={[8, 14, 7]}
          intensity={2.2}
          color="#fff5df"
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-14}
          shadow-camera-right={14}
          shadow-camera-top={14}
          shadow-camera-bottom={-14}
          shadow-bias={-0.0005}
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
