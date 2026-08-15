import {
  PLATFORM_HEIGHT,
  TILE_HEIGHT,
  boardLayout,
} from './boardLayout';
import BoardBase from './BoardBase';
import { boardVisualTokens } from './boardVisualTokens';

export default function Board3D() {
  return (
    <group>
      <BoardBase />
      {boardLayout.map(layout => (
        <mesh
          key={layout.tileId}
          position={[layout.position[0], PLATFORM_HEIGHT + TILE_HEIGHT / 2, layout.position[2]]}
          rotation={layout.rotation}
          receiveShadow
        >
          <boxGeometry args={[layout.size[0], TILE_HEIGHT, layout.size[1]]} />
          <meshStandardMaterial
            color={boardVisualTokens.tileSurface}
            roughness={0.76}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  );
}
