import {
  useEffect, useLayoutEffect, useMemo, useRef,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardRenderModel } from '../board/boardRenderModel';
import { resolveMoneyEndpointAnchor, type WorldAnchor } from './stationWorld';

export default function MoneyTransferLayer({ model }: { model?: BoardRenderModel }) {
  const signal = model?.moneyTransfers.at(-1);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const elapsedRef = useRef(0);
  const activeSequenceRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  const object = useMemo(() => new THREE.Object3D(), []);
  const anchors = useMemo(() => new Map<string, WorldAnchor>(
    model?.stations.map(station => [station.playerId, station.anchor]) ?? [],
  ), [model?.stations]);
  const from = signal ? resolveMoneyEndpointAnchor(signal.source, anchors) : null;
  const to = signal ? resolveMoneyEndpointAnchor(signal.destination, anchors) : null;

  useLayoutEffect(() => {
    meshRef.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, [signal?.id]);

  useEffect(() => {
    if (!signal || signal.sequence === activeSequenceRef.current) return;
    activeSequenceRef.current = signal.sequence;
    elapsedRef.current = 0;
    invalidate();
  }, [invalidate, signal]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !signal || !from || !to || signal.durationMs <= 0) return;
    elapsedRef.current += delta * 1000;
    let active = false;
    for (let index = 0; index < signal.coinCount; index += 1) {
      const delay = index * 0.055;
      const progress = THREE.MathUtils.clamp(
        elapsedRef.current / signal.durationMs * 1.28 - delay,
        0,
        1,
      );
      const arc = Math.sin(progress * Math.PI) * (0.58 + (index % 3) * 0.08);
      const lane = (index - (signal.coinCount - 1) / 2) * 0.035;
      object.position.set(
        THREE.MathUtils.lerp(from[0], to[0], progress) + lane,
        THREE.MathUtils.lerp(from[1], to[1], progress) + arc,
        THREE.MathUtils.lerp(from[2], to[2], progress) - lane,
      );
      object.rotation.set(Math.PI / 2, progress * Math.PI * 3 + index, 0);
      const visible = progress < 1 ? 1 : 0;
      object.scale.setScalar(visible);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      active ||= progress < 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (active) invalidate();
  });

  if (!signal || !from || !to || signal.durationMs <= 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, signal.coinCount]}
      name={`MoneyTransfer:${signal.id}`}
      frustumCulled={false}
    >
      <cylinderGeometry args={[0.09, 0.09, 0.035, 12]} />
      <meshStandardMaterial color="#ffd45d" emissive="#9d6b12" emissiveIntensity={0.16} metalness={0.38} roughness={0.42} />
    </instancedMesh>
  );
}
