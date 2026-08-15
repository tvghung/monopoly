import { boardVisualTokens } from '../board/boardVisualTokens';

interface JailVisualProps {
  size: readonly [number, number];
}

export default function JailVisual({ size }: JailVisualProps) {
  const barCount = 4;
  const barSpacing = size[0] / (barCount + 1);
  return (
    <group position={[0, 0.48, 0]}>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[size[0] * 0.72, 0.1, size[1] * 0.62]} />
        <meshStandardMaterial color={boardVisualTokens.jail} roughness={0.76} />
      </mesh>
      {Array.from({ length: barCount }, (_, index) => (
        <mesh key={index} position={[(index + 1) * barSpacing - size[0] / 2, 0.42, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.72, 8]} />
          <meshStandardMaterial color="#2f302e" roughness={0.65} />
        </mesh>
      ))}
      <mesh position={[0, 0.77, 0]} castShadow>
        <boxGeometry args={[size[0] * 0.72, 0.08, 0.08]} />
        <meshStandardMaterial color="#2f302e" roughness={0.65} />
      </mesh>
    </group>
  );
}
