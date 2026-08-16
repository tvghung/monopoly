import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { TILE_SURFACE_CLEARANCE_Y } from '../board/boardLayout';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import type { TilePanelLayout } from '../board/tiles/tilePanelLayout';
import { getUtilityArtKind } from './specialTileArt';

const UTILITY_BULB_COLOR = '#ffd400';
const UTILITY_BULB_HIGHLIGHT_COLOR = '#fff7c7';
const UTILITY_BULB_RAY_COLOR = '#ffd400';
const UTILITY_SOCKET_COLOR = '#7a7f84';
const UTILITY_SOCKET_DARK_COLOR = '#555a60';
const UTILITY_FAUCET_COLOR = '#111a22';
const UTILITY_DROP_COLOR = '#19bdeb';

interface UtilityVisualProps {
  panel: TilePanelLayout;
  label: string;
}

function createBulbGlassGeometry(radius: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -radius * 0.9);
  shape.quadraticCurveTo(-radius * 0.72, -radius * 0.86, -radius * 0.78, -radius * 0.22);
  shape.quadraticCurveTo(-radius * 0.76, radius * 0.3, -radius * 0.4, radius * 0.58);
  shape.quadraticCurveTo(-radius * 0.22, radius * 0.72, -radius * 0.2, radius * 0.82);
  shape.lineTo(radius * 0.2, radius * 0.82);
  shape.quadraticCurveTo(radius * 0.22, radius * 0.72, radius * 0.4, radius * 0.58);
  shape.quadraticCurveTo(radius * 0.76, radius * 0.3, radius * 0.78, -radius * 0.22);
  shape.quadraticCurveTo(radius * 0.72, -radius * 0.86, 0, -radius * 0.9);
  return new THREE.ShapeGeometry(shape);
}

function createWaterDropGeometry(radius: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -radius);
  shape.bezierCurveTo(-radius * 0.8, -radius * 0.18, -radius * 0.68, radius * 0.62, 0, radius * 0.68);
  shape.bezierCurveTo(radius * 0.68, radius * 0.62, radius * 0.8, -radius * 0.18, 0, -radius);
  return new THREE.ShapeGeometry(shape);
}

function ElectricBulbIcon({ radius }: { radius: number }) {
  const glassGeometry = useMemo(() => createBulbGlassGeometry(radius), [radius]);
  useEffect(() => () => glassGeometry.dispose(), [glassGeometry]);

  return (
    <group name="ElectricBulb2D">
      {Array.from({ length: 8 }, (_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        return (
          <RoundedBoxMesh
            key={index}
            name="ElectricBulbRay"
            width={0.025}
            height={0.014}
            depth={radius * 0.22}
            radius={0.008}
            color={UTILITY_BULB_RAY_COLOR}
            materialProfile="propertyTrim"
            position={[Math.cos(angle) * radius * 0.96, 0.022, -radius * 0.04 + Math.sin(angle) * radius * 0.96]}
            rotation={[0, -angle, 0]}
          />
        );
      })}
      <mesh
        name="ElectricBulbGlass"
        geometry={glassGeometry}
        position={[0, 0.035, -radius * 0.04]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <meshStandardMaterial
          color={UTILITY_BULB_COLOR}
          emissive={UTILITY_BULB_COLOR}
          emissiveIntensity={0.32}
          roughness={0.28}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh name="ElectricBulbHighlight" position={[-radius * 0.25, 0.052, -radius * 0.34]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.14, 16]} />
        <meshStandardMaterial color={UTILITY_BULB_HIGHLIGHT_COLOR} emissive={UTILITY_BULB_HIGHLIGHT_COLOR} emissiveIntensity={0.12} />
      </mesh>
      <RoundedBoxMesh
        name="ElectricBulbSocket"
        width={radius * 0.44}
        height={0.028}
        depth={radius * 0.28}
        radius={0.018}
        color={UTILITY_SOCKET_DARK_COLOR}
        materialProfile="metal"
        position={[0, 0.047, radius * 0.72]}
      />
      {[0, 1, 2].map(index => (
        <RoundedBoxMesh
          key={index}
          name="ElectricBulbSocketBand"
          width={radius * 0.48}
          height={0.018}
          depth={radius * 0.055}
          radius={0.009}
          color={index === 1 ? UTILITY_SOCKET_COLOR : UTILITY_SOCKET_DARK_COLOR}
          materialProfile="metal"
          position={[0, 0.064 + index * 0.018, radius * (0.58 + index * 0.12)]}
        />
      ))}
    </group>
  );
}

function WaterFaucetIcon({ radius }: { radius: number }) {
  const dropGeometry = useMemo(() => createWaterDropGeometry(radius * 0.13), [radius]);
  useEffect(() => () => dropGeometry.dispose(), [dropGeometry]);

  return (
    <group name="WaterFaucet2D">
      <RoundedBoxMesh
        name="WaterFaucetHandle"
        width={radius * 0.72}
        height={0.032}
        depth={0.08}
        radius={0.025}
        color={UTILITY_FAUCET_COLOR}
        materialProfile="metal"
        position={[0, 0.045, -radius * 0.56]}
      />
      <RoundedBoxMesh
        name="WaterFaucetHandleStem"
        width={0.075}
        height={0.032}
        depth={radius * 0.28}
        radius={0.025}
        color={UTILITY_FAUCET_COLOR}
        materialProfile="metal"
        position={[0, 0.045, -radius * 0.38]}
      />
      <RoundedBoxMesh
        name="WaterFaucetBody"
        width={radius * 0.3}
        height={0.04}
        depth={radius * 0.48}
        radius={0.04}
        color={UTILITY_FAUCET_COLOR}
        materialProfile="metal"
        position={[0, 0.05, -radius * 0.08]}
      />
      <RoundedBoxMesh
        name="WaterFaucetSpout"
        width={radius * 0.8}
        height={0.04}
        depth={0.1}
        radius={0.04}
        color={UTILITY_FAUCET_COLOR}
        materialProfile="metal"
        position={[radius * 0.24, 0.05, radius * 0.18]}
      />
      <RoundedBoxMesh
        name="WaterFaucetSpoutDropTube"
        width={0.1}
        height={0.04}
        depth={radius * 0.24}
        radius={0.04}
        color={UTILITY_FAUCET_COLOR}
        materialProfile="metal"
        position={[radius * 0.6, 0.05, radius * 0.3]}
      />
      <mesh name="WaterFaucetDrop" geometry={dropGeometry} position={[radius * 0.6, 0.066, radius * 0.53]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={UTILITY_DROP_COLOR} emissive={UTILITY_DROP_COLOR} emissiveIntensity={0.12} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export default function UtilityVisual({ panel, label }: UtilityVisualProps) {
  const radius = Math.min(panel.upperSize[0], panel.upperSize[1])
    * (panel.side === 'CORNER' ? 0.28 : 0.33);
  const utilityKind = getUtilityArtKind(label);
  return (
    <group
      name={utilityKind === 'water-faucet-2d' ? 'WaterFaucetGraphic2D' : 'ElectricBulbGraphic2D'}
      position={[0, TILE_SURFACE_CLEARANCE_Y + 0.014, panel.side === 'CORNER' ? 0 : panel.upperCenterLocalZ]}
      rotation={[0, panel.contentRotationY, 0]}
    >
      {utilityKind === 'water-faucet-2d'
        ? <WaterFaucetIcon radius={radius} />
        : <ElectricBulbIcon radius={radius} />}
    </group>
  );
}
