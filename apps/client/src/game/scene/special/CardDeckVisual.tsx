import { boardVisualTokens } from '../board/boardVisualTokens';
import { SURFACE_EPSILON, TILE_SURFACE_Y } from '../board/boardLayout';

interface CardDeckVisualProps {
  size: readonly [number, number];
  kind: 'chance' | 'chest';
}

export default function CardDeckVisual({ size, kind }: CardDeckVisualProps) {
  const color = kind === 'chance' ? boardVisualTokens.chance : boardVisualTokens.chest;
  const cardHeight = 0.07;
  return (
    <group
      position={[0, TILE_SURFACE_Y + SURFACE_EPSILON + cardHeight / 2, 0]}
      rotation={[0, Math.PI / 8, 0]}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <mesh
          key={index}
          position={[0, index * cardHeight, (index - 1) * 0.04]}
          rotation={[0, 0, index % 2 === 0 ? -0.05 : 0.05]}
          castShadow
        >
          <boxGeometry args={[size[0] * 0.45, cardHeight, size[1] * 0.3]} />
          <meshStandardMaterial color={color} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}
