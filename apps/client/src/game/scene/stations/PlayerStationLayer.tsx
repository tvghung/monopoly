import { useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerStationRenderModel } from '../board/boardRenderModel';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import SdfSurfaceText from '../board/tiles/SdfSurfaceText';
import { BANK_WORLD_ANCHOR } from './stationWorld';

export function wealthCoinCount(balance: number): number {
  if (balance <= 0) return 0;
  if (balance < 200) return 2;
  if (balance < 500) return 3;
  if (balance < 1_000) return 4;
  if (balance < 1_500) return 5;
  if (balance < 2_000) return 6;
  if (balance < 3_000) return 7;
  return 8;
}

function StationCoinPile({ station }: { station: PlayerStationRenderModel }) {
  const count = wealthCoinCount(station.accountBalance);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let index = 0; index < count; index += 1) {
      const column = index % 4;
      const row = Math.floor(index / 4);
      matrix.makeTranslation((column - 1.5) * 0.17, 0.08 + row * 0.08, 0);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [count, invalidate, matrix]);
  if (count === 0) return null;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} name={`StationCoins:${station.playerId}`}>
      <cylinderGeometry args={[0.075, 0.075, 0.045, 12]} />
      <meshStandardMaterial color="#e8b648" metalness={0.25} roughness={0.55} />
    </instancedMesh>
  );
}

function BankTreasury() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let index = 0; index < 6; index += 1) {
      const column = index % 3;
      const row = Math.floor(index / 3);
      matrix.makeTranslation((column - 1) * 0.19, 0.12 + row * 0.07, 0.08);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [invalidate, matrix]);
  return (
    <group name="BankTreasury" position={BANK_WORLD_ANCHOR}>
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[1.4, 0.14, 0.68]} />
        <meshStandardMaterial color="#365247" roughness={0.78} />
      </mesh>
      <instancedMesh ref={meshRef} args={[undefined, undefined, 6]} name="BankTreasuryCoins">
        <cylinderGeometry args={[0.08, 0.08, 0.045, 12]} />
        <meshStandardMaterial color="#e8b648" metalness={0.25} roughness={0.55} />
      </instancedMesh>
      <SdfSurfaceText
        value="NGÂN HÀNG"
        position={[0, 0.105, -0.1]}
        fontSize={0.16}
        maxWidth={1.15}
        color="#f7e8b2"
        name="BankTreasuryLabel"
      />
    </group>
  );
}

export default function PlayerStationLayer({ stations }: { stations: readonly PlayerStationRenderModel[] }) {
  return (
    <group name="PlayerStationLayer">
      <BankTreasury />
      {stations.map(station => {
        const activeColor = getPlayerDisplayColor(station.color);
        const color = station.status === 'ACTIVE' ? activeColor : '#7d8582';
        return (
          <group key={station.playerId} name={`PlayerStation:${station.slot}`} position={station.anchor}>
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[1.15, 0.12, 0.48]} />
              <meshStandardMaterial color={color} roughness={0.74} />
            </mesh>
            <StationCoinPile station={station} />
            {station.isCurrentTurn
              ? (
                <mesh position={[0, 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.66, 0.035, 6, 20]} />
                  <meshStandardMaterial color="#ffe47b" emissive="#e2a933" emissiveIntensity={0.35} />
                </mesh>
              )
              : null}
          </group>
        );
      })}
    </group>
  );
}
