import {
  useEffect, useLayoutEffect, useMemo, useRef,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardRenderModel } from '../board/boardRenderModel';
import {
  COIN_GOLD,
  SHARED_COIN_GEOMETRY,
  SHARED_COIN_MATERIAL,
} from './coinVisuals';
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
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < (signal?.coinCount ?? 0); index += 1) {
      mesh.setColorAt(index, COIN_GOLD);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [signal?.coinCount, signal?.id]);

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
      const arc = Math.sin(progress * Math.PI) * (0.78 + (index % 3) * 0.09);
      const lane = (index - (signal.coinCount - 1) / 2) * 0.055;
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
      args={[SHARED_COIN_GEOMETRY, SHARED_COIN_MATERIAL, signal.coinCount]}
      name={`MoneyTransfer:${signal.id}`}
      frustumCulled={false}
    />
  );
}
