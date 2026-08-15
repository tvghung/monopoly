import { boardVisualTokens } from '../board/boardVisualTokens';
import { CARD_DECK_CENTER_Y, CARD_HEIGHT } from '../board/boardLayout';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import ContactShadow from '../fx/ContactShadow';

interface CardDeckVisualProps {
  size: readonly [number, number];
  kind: 'chance' | 'chest';
}

export default function CardDeckVisual({ size, kind }: CardDeckVisualProps) {
  const color = kind === 'chance' ? boardVisualTokens.chance : boardVisualTokens.chest;
  return (
    <group
      name={`${kind === 'chance' ? 'Chance' : 'Chest'}Visual`}
      position={[0, CARD_DECK_CENTER_Y, 0]}
      rotation={[0, Math.PI / 8, 0]}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <RoundedBoxMesh
          key={index}
          width={size[0] * 0.45}
          height={CARD_HEIGHT}
          depth={size[1] * 0.3}
          radius={0.025}
          color={color}
          materialProfile="propertyTrim"
          position={[0, index * CARD_HEIGHT, (index - 1) * 0.04]}
          rotation={[0, 0, index % 2 === 0 ? -0.05 : 0.05]}
        />
      ))}
      <mesh position={[0, CARD_HEIGHT * 3 + 0.02, 0]}>
        <torusGeometry args={[0.12, 0.025, 8, 16]} />
        <meshStandardMaterial color={color} roughness={0.3} metalness={0.08} />
      </mesh>
      <ContactShadow scale={[0.62, 0.38]} opacity={0.16} position={[0, -0.008, 0]} />
    </group>
  );
}
