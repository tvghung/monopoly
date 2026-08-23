import {
  useEffect, useLayoutEffect, useMemo, useRef,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardRenderModel } from '../board/boardRenderModel';
import type { MoneyTransferSignal } from '../../presentation/store/types';
import {
  COIN_FINISH_MATERIALS,
  COIN_FINISH_ORDER,
  coinFinishForIndex,
  SHARED_COIN_GEOMETRY,
  stableCoinSeed,
  type CoinFinish,
} from './coinVisuals';
import { resolveMoneyEndpointAnchor, type WorldAnchor } from './stationWorld';

function TransferCoinFinish({
  finish,
  signal,
  from,
  to,
  indices,
}: {
  finish: CoinFinish;
  signal: MoneyTransferSignal;
  from: WorldAnchor;
  to: WorldAnchor;
  indices: readonly number[];
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const elapsedRef = useRef(0);
  const activeSequenceRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  const object = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    indices.forEach((_, index) => {
      mesh.setColorAt(index, new THREE.Color('#ffffff'));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [indices, signal.id]);

  useEffect(() => {
    if (signal.sequence === activeSequenceRef.current) return;
    activeSequenceRef.current = signal.sequence;
    elapsedRef.current = 0;
    invalidate();
  }, [invalidate, signal]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || signal.durationMs <= 0) return;
    elapsedRef.current += delta * 1000;
    let active = false;
    indices.forEach((globalIndex, index) => {
      const delay = globalIndex * 0.055;
      const progress = THREE.MathUtils.clamp(
        elapsedRef.current / signal.durationMs * 1.28 - delay,
        0,
        1,
      );
      const arc = Math.sin(progress * Math.PI) * (0.78 + (globalIndex % 3) * 0.09);
      const lane = (globalIndex - (signal.coinCount - 1) / 2) * 0.055;
      object.position.set(
        THREE.MathUtils.lerp(from[0], to[0], progress) + lane,
        THREE.MathUtils.lerp(from[1], to[1], progress) + arc,
        THREE.MathUtils.lerp(from[2], to[2], progress) - lane,
      );
      object.rotation.set(Math.PI / 2, progress * Math.PI * 3 + globalIndex, 0);
      object.scale.setScalar(progress < 1 ? 1 : 0);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      active ||= progress < 1;
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (active) invalidate();
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[SHARED_COIN_GEOMETRY, COIN_FINISH_MATERIALS[finish], indices.length]}
      name={`MoneyTransferCoins:${finish}:${signal.id}`}
      frustumCulled={false}
    />
  );
}

export default function MoneyTransferLayer({ model }: { model?: BoardRenderModel }) {
  const signal = model?.moneyTransfers.at(-1);
  const anchors = useMemo(() => new Map<string, WorldAnchor>(
    model?.stations.map(station => [station.playerId, station.anchor]) ?? [],
  ), [model?.stations]);
  const from = signal ? resolveMoneyEndpointAnchor(signal.source, anchors) : null;
  const to = signal ? resolveMoneyEndpointAnchor(signal.destination, anchors) : null;
  const finishIndices = useMemo(() => {
    if (!signal) return new Map<CoinFinish, number[]>();
    const seed = stableCoinSeed(signal.id);
    return new Map(COIN_FINISH_ORDER.map(finish => [
      finish,
      Array.from({ length: signal.coinCount }, (_, index) => index)
        .filter(index => coinFinishForIndex(index, seed) === finish),
    ]));
  }, [signal]);

  if (!signal || !from || !to || signal.durationMs <= 0) return null;
  return (
    <group name={`MoneyTransfer:${signal.id}`}>
      {COIN_FINISH_ORDER.map(finish => {
        const indices = finishIndices.get(finish) ?? [];
        return indices.length > 0
          ? <TransferCoinFinish key={finish} finish={finish} signal={signal} from={from} to={to} indices={indices} />
          : null;
      })}
    </group>
  );
}
