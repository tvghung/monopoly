import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CardPresentationSignal } from '../../presentation/store/types';
import SdfSurfaceText from '../board/tiles/SdfSurfaceText';

const DECK_ANCHORS = {
  chance: [-3.35, 0.39, 1.2],
  chest: [3.35, 0.39, 1.2],
} as const;

function DeckStack({ deck }: { deck: keyof typeof DECK_ANCHORS }) {
  const stackRef = useRef<THREE.InstancedMesh>(null);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const mesh = stackRef.current;
    if (!mesh) return;
    const anchor = DECK_ANCHORS[deck];
    for (let layer = 0; layer < 5; layer += 1) {
      matrix.makeTranslation(anchor[0], anchor[1] + layer * 0.042, anchor[2]);
      mesh.setMatrixAt(layer, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [deck, invalidate, matrix]);
  return (
    <instancedMesh ref={stackRef} args={[undefined, undefined, 5]} name={`${deck}CardStack`}>
      <boxGeometry args={[1.18, 0.035, 0.76]} />
      <meshStandardMaterial color={deck === 'chance' ? '#cf6845' : '#d9ad3f'} roughness={0.7} />
    </instancedMesh>
  );
}

function AnimatedTopCard({ signal }: { signal: CardPresentationSignal }) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  const source = DECK_ANCHORS[signal.deck];
  useEffect(() => {
    elapsedRef.current = 0;
    invalidate();
  }, [invalidate, signal.operationId, signal.stage]);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || signal.stage !== 'DRAWING' || signal.durationMs <= 0) return;
    elapsedRef.current += delta * 1000;
    const progress = THREE.MathUtils.clamp(elapsedRef.current / signal.durationMs, 0, 1);
    const eased = 1 - (1 - progress) ** 3;
    group.position.set(
      THREE.MathUtils.lerp(source[0], 0, eased),
      THREE.MathUtils.lerp(source[1] + 0.2, 1.22, eased) + Math.sin(progress * Math.PI) * 0.34,
      THREE.MathUtils.lerp(source[2], 0.55, eased),
    );
    group.rotation.set(0, progress * Math.PI, progress * 0.18);
    if (progress < 1) invalidate();
  });
  if (signal.stage === 'REVEALED') return null;
  return (
    <group ref={groupRef} position={[source[0], source[1] + (signal.stage === 'AWAITING_DRAW' ? 0.28 : 0.2), source[2]]}>
      <mesh>
        <boxGeometry args={[1.18, 0.055, 0.76]} />
        <meshStandardMaterial color={signal.deck === 'chance' ? '#d96a43' : '#e6bc4b'} roughness={0.62} />
      </mesh>
    </group>
  );
}

export default function PhysicalCardDecks({ signal }: { signal: CardPresentationSignal | null }) {
  return (
    <group name="PhysicalCardDecks">
      <DeckStack deck="chance" />
      <DeckStack deck="chest" />
      <SdfSurfaceText value="CƠ HỘI" position={[-3.35, 0.62, 1.2]} fontSize={0.18} maxWidth={1} color="#fff2d6" name="ChanceDeckLabel" />
      <SdfSurfaceText value="KHÍ VẬN" position={[3.35, 0.62, 1.2]} fontSize={0.18} maxWidth={1} color="#fff8dc" name="ChestDeckLabel" />
      {signal ? <AnimatedTopCard signal={signal} /> : null}
    </group>
  );
}
