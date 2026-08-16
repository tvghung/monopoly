import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import { boardVisualTokens } from '../board/boardVisualTokens';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { getTilePanelLayoutForTileSize } from '../board/tiles/tilePanelLayout';
import { getUtilityArtKind } from './specialTileArt';

interface UtilityVisualProps {
  size: readonly [number, number];
  label: string;
  isCorner: boolean;
  contentRotationY: number;
}

function ElectricBulbIcon({ radius }: { radius: number }) {
  return (
    <group name="ElectricBulb2D">
      <mesh name="ElectricBulbGlow" position={[0, 0.034, -0.02]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.82, 24]} />
        <meshStandardMaterial
          color={boardVisualTokens.utilityBulb}
          emissive={boardVisualTokens.utilityBulb}
          emissiveIntensity={0.32}
          roughness={0.3}
        />
      </mesh>
      <RoundedBoxMesh
        name="ElectricBulbBase"
        width={radius * 0.42}
        height={0.026}
        depth={radius * 0.26}
        radius={0.018}
        color={boardVisualTokens.utilityBulbBase}
        materialProfile="metal"
        position={[0, 0.048, radius * 0.45]}
      />
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <RoundedBoxMesh
            key={index}
            name="ElectricBulbRay"
            width={0.025}
            height={0.014}
            depth={radius * 0.24}
            radius={0.008}
            color={boardVisualTokens.utilityBulbRay}
            materialProfile="propertyTrim"
            position={[Math.cos(angle) * radius * 0.96, 0.022, -0.02 + Math.sin(angle) * radius * 0.96]}
            rotation={[0, -angle, 0]}
          />
        );
      })}
    </group>
  );
}

function WaterValveIcon({ radius }: { radius: number }) {
  return (
    <group name="WaterValve2D">
      <mesh name="WaterValveRing" position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.58, radius * 0.75, 24]} />
        <meshStandardMaterial color={boardVisualTokens.utilityWater} roughness={0.32} metalness={0.08} />
      </mesh>
      {Array.from({ length: 6 }, (_, index) => (
        <RoundedBoxMesh
          key={index}
          name="WaterValveSpoke"
          width={0.035}
          height={0.018}
          depth={radius * 1.42}
          radius={0.012}
          color={boardVisualTokens.utilityValve}
          materialProfile="metal"
          position={[0, 0.041, 0]}
          rotation={[0, (index / 6) * Math.PI, 0]}
        />
      ))}
      <mesh name="WaterValveHub" position={[0, 0.052, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.2, 16]} />
        <meshStandardMaterial color={boardVisualTokens.utilityValve} roughness={0.28} metalness={0.14} />
      </mesh>
      <RoundedBoxMesh
        name="WaterValveFaucet"
        width={radius * 0.82}
        height={0.02}
        depth={0.07}
        radius={0.02}
        color={boardVisualTokens.utilityWater}
        materialProfile="metal"
        position={[0, 0.044, radius * 0.9]}
      />
    </group>
  );
}

export default function UtilityVisual({ size, label, isCorner, contentRotationY }: UtilityVisualProps) {
  const panels = getTilePanelLayoutForTileSize(size);
  const radius = Math.min(panels.upperSize[0], panels.upperSize[1]) * (isCorner ? 0.28 : 0.33);
  const utilityKind = getUtilityArtKind(label);
  return (
    <group
      name={utilityKind === 'water-valve-2d' ? 'WaterValveGraphic2D' : 'ElectricBulbGraphic2D'}
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, isCorner ? 0 : panels.upperCenterLocalZ]}
      rotation={[0, contentRotationY, 0]}
    >
      {utilityKind === 'water-valve-2d'
        ? <WaterValveIcon radius={radius} />
        : <ElectricBulbIcon radius={radius} />}
    </group>
  );
}
