import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { DiceValue } from '@monopoly/shared';
import { getBoardMaterialProps } from '../board/materials/boardMaterialSpecs';
import type { DiceRenderModel } from '../board/boardRenderModel';
import { getDicePosition } from './diceLayout';
import {
  createDiceBodyGeometry,
  getDicePipCylinderQuaternion,
  getDicePipInstances,
} from './diceGeometry';
import {
  easeOutCubic,
  getDiceAnimationRotation,
  getDiceAnimationVerticalOffset,
  getDiceMotionTrailOpacity,
  getSettledDiceRotation,
  isValidDiceFace,
} from './diceOrientation';
import {
  DICE_BODY_COLOR,
  DICE_PIP_COLOR,
  DICE_PIP_DEPTH,
  DICE_PIP_DEPTH_TEST,
  DICE_PIP_POLYGON_OFFSET_ENABLED,
  DICE_PIP_POLYGON_OFFSET_FACTOR,
  DICE_PIP_POLYGON_OFFSET_UNITS,
  DICE_PIP_SEGMENTS,
  DICE_PIP_RADIUS,
} from './diceVisualConfig';
import DiceContactShadowBatch, { useDiceContactShadowMaterial } from './DiceContactShadowBatch';
import { DiceAnimationClock, useDiceAnimationProgressRef } from './diceAnimationClock';
import { useRenderQuality } from '../render/RenderQualityContext';

function DieBody({ geometry, castShadow }: { geometry: THREE.BufferGeometry; castShadow: boolean }) {
  return (
    <mesh name="DieBody" castShadow={castShadow} dispose={null}>
      <primitive object={geometry} attach="geometry" dispose={null} />
      <meshPhysicalMaterial {...getBoardMaterialProps('diceBody', DICE_BODY_COLOR)} />
    </mesh>
  );
}

function DiePips() {
  const pips = useMemo(() => getDicePipInstances(), []);
  const pipsRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = pipsRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    pips.forEach((pip, index) => {
      quaternion.copy(getDicePipCylinderQuaternion(pip.rotation));
      matrix.compose(new THREE.Vector3(...pip.position), quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [pips]);

  return (
    <instancedMesh
      ref={pipsRef}
      args={[undefined, undefined, pips.length]}
      name="DiePips"
      frustumCulled={false}
    >
      <cylinderGeometry args={[DICE_PIP_RADIUS, DICE_PIP_RADIUS, DICE_PIP_DEPTH, DICE_PIP_SEGMENTS, 1, false]} />
      <meshStandardMaterial
        color={DICE_PIP_COLOR}
        roughness={0.5}
        metalness={0}
        depthTest={DICE_PIP_DEPTH_TEST}
        polygonOffset={DICE_PIP_POLYGON_OFFSET_ENABLED}
        polygonOffsetFactor={DICE_PIP_POLYGON_OFFSET_FACTOR}
        polygonOffsetUnits={DICE_PIP_POLYGON_OFFSET_UNITS}
      />
    </instancedMesh>
  );
}

/** Trail meshes per die for a quality tier: none on Low, one on Balanced, two on High. */
export function getDiceTrailCount(tier: 'low' | 'balanced' | 'high'): number {
  if (tier === 'high') return 2;
  return tier === 'balanced' ? 1 : 0;
}

export function createDiceTrailMaterials(count: number): THREE.MeshBasicMaterial[] {
  return Array.from({ length: count }, (_, index) => new THREE.MeshBasicMaterial({
    color: index === 0 ? '#d6e7ff' : '#edf4ff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  }));
}

/**
 * The trail materials of one die, owned by the always-mounted dice layer. The trail meshes exist only while a roll plays and
 * the dice themselves only while they are visible (a replay or a reset hides them): a material disposed with either released
 * its shader program, so the next roll linked the identical program again on the main thread (audit PERF-05). Created once
 * per trail count, disposed when the layer goes away or the quality tier changes the count.
 */
export function useDiceTrailMaterials(count: number): THREE.MeshBasicMaterial[] {
  const materials = useMemo(() => createDiceTrailMaterials(count), [count]);
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials]);
  return materials;
}

/**
 * The one die body geometry both dice share, owned by the always-mounted dice layer. Building it (a rounded box, six face
 * plates, a merge) takes about as long as a frame, and each `Die` used to build and dispose its own whenever the dice appeared:
 * on every first roll, replay and reset. It is built the first time the dice are shown (never at load) and kept until the layer
 * goes away; the dice and their trails borrow it and never dispose it.
 */
export function useDiceBodyGeometry(needed: boolean): THREE.BufferGeometry | null {
  const everNeededRef = useRef(false);
  if (needed) everNeededRef.current = true;
  const everNeeded = everNeededRef.current;
  const geometry = useMemo(() => (everNeeded ? createDiceBodyGeometry() : null), [everNeeded]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}

function DiceMotionTrail({
  geometry,
  materials,
  progressRef,
  basePosition,
  value,
  rollSequence,
  dieIndex,
  fromValue,
  tier,
  hasPreviousDice,
}: {
  geometry: THREE.BufferGeometry;
  materials: readonly THREE.MeshBasicMaterial[];
  progressRef: ReturnType<typeof useDiceAnimationProgressRef>;
  basePosition: readonly [number, number, number];
  value: number;
  rollSequence: number;
  dieIndex: 0 | 1;
  fromValue?: number;
  tier: 'high' | 'balanced';
  hasPreviousDice: boolean;
}) {
  const count = materials.length;
  const refs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(() => {
    const progress = progressRef.current.progress;
    const opacity = getDiceMotionTrailOpacity(progress, tier);
    for (let index = 0; index < count; index += 1) {
      const mesh = refs.current[index];
      if (!mesh) continue;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material) continue;
      mesh.visible = opacity > 0;
      if (opacity <= 0) continue;
      const sampleProgress = Math.max(0, progress - (index + 1) * 0.055);
      mesh.rotation.set(...getDiceAnimationRotation(value, rollSequence, dieIndex, sampleProgress, fromValue));
      mesh.position.set(
        basePosition[0],
        basePosition[1] + getDiceAnimationVerticalOffset(sampleProgress, hasPreviousDice),
        basePosition[2],
      );
      mesh.scale.setScalar(hasPreviousDice ? 1 : 0.86 + easeOutCubic(sampleProgress) * 0.14);
      material.opacity = opacity * (index === 0 ? 0.68 : 0.32);
    }
  });

  return (
    <>
      {materials.map((material, index) => (
        <mesh
          key={index}
          ref={mesh => { refs.current[index] = mesh; }}
          geometry={geometry}
          material={material}
          visible={false}
          dispose={null}
          renderOrder={1}
        />
      ))}
    </>
  );
}

function isValidDiceValue(dice: DiceValue): boolean {
  return isValidDiceFace(dice.dice1) && isValidDiceFace(dice.dice2);
}

function Die({
  geometry,
  dieIndex,
  value,
  phase,
  rollSequence,
  fromValue,
  reducedMotion,
  trailMaterials,
}: {
  geometry: THREE.BufferGeometry;
  dieIndex: 0 | 1;
  value: number;
  phase: DiceRenderModel['phase'];
  rollSequence: number;
  fromValue?: number;
  reducedMotion: boolean;
  trailMaterials: readonly THREE.MeshBasicMaterial[];
}) {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useDiceAnimationProgressRef();
  const { tier } = useRenderQuality();
  const basePosition = getDicePosition(dieIndex);
  const isRolling = phase === 'ROLLING';
  const hasPreviousDice = isValidDiceFace(fromValue ?? 0);

  useFrame(() => {
    if (!isRolling || !groupRef.current) return;
    const progress = progressRef.current.progress;
    const eased = easeOutCubic(progress);
    const rotation = getDiceAnimationRotation(value, rollSequence, dieIndex, progress, fromValue, reducedMotion);
    groupRef.current.rotation.set(...rotation);
    groupRef.current.position.y = basePosition[1]
      + getDiceAnimationVerticalOffset(progress, hasPreviousDice);
    const scale = hasPreviousDice ? 1 : 0.86 + eased * 0.14;
    groupRef.current.scale.setScalar(scale);
  });

  const rotation = isRolling
    ? getDiceAnimationRotation(value, rollSequence, dieIndex, 0, fromValue, reducedMotion)
    : getSettledDiceRotation(value);

  return (
    <group>
      {isRolling && !reducedMotion && tier !== 'low'
        ? <DiceMotionTrail
          geometry={geometry}
          materials={trailMaterials}
          progressRef={progressRef}
          basePosition={basePosition}
          value={value}
          rollSequence={rollSequence}
          dieIndex={dieIndex}
          fromValue={fromValue}
          tier={tier}
          hasPreviousDice={hasPreviousDice}
        />
        : null}
      <group
        ref={groupRef}
        name={`ProceduralDie${dieIndex + 1}`}
        position={isRolling
          ? [basePosition[0], basePosition[1] + getDiceAnimationVerticalOffset(0, hasPreviousDice), basePosition[2]]
          : basePosition}
        rotation={rotation}
        scale={isRolling && !hasPreviousDice ? 0.86 : 1}
      >
        <DieBody geometry={geometry} castShadow={tier === 'high'} />
        <DiePips />
      </group>
    </group>
  );
}

function DiceLayer({
  model,
  reducedMotion = false,
}: {
  model: DiceRenderModel;
  reducedMotion?: boolean;
}) {
  const hasVisibleDice = model.phase !== 'HIDDEN' && isValidDiceValue(model.dice);
  // Effect materials live as long as the layer, not as long as the dice are visible or a roll is playing.
  const { tier } = useRenderQuality();
  const trailCount = getDiceTrailCount(tier);
  const firstDieTrail = useDiceTrailMaterials(trailCount);
  const secondDieTrail = useDiceTrailMaterials(trailCount);
  const contactShadowMaterial = useDiceContactShadowMaterial();
  const bodyGeometry = useDiceBodyGeometry(hasVisibleDice);

  return (
    <group
      name="DiceArena"
      userData={{
        coordinateSystem: 'board-world',
        centerFieldClearance: true,
      }}
    >
      {hasVisibleDice && bodyGeometry
        ? (
          <DiceAnimationClock
            phase={model.phase === 'ROLLING' ? 'ROLLING' : 'SETTLED'}
            rollSequence={model.rollSequence}
            durationMs={model.durationMs}
          >
            <DiceContactShadowBatch fromDice={model.fromDice} material={contactShadowMaterial} />
            <Die
              geometry={bodyGeometry}
              dieIndex={0}
              value={model.dice.dice1}
              phase={model.phase}
              rollSequence={model.rollSequence}
              fromValue={model.fromDice?.dice1}
              reducedMotion={reducedMotion}
              trailMaterials={firstDieTrail}
            />
            <Die
              geometry={bodyGeometry}
              dieIndex={1}
              value={model.dice.dice2}
              phase={model.phase}
              rollSequence={model.rollSequence}
              fromValue={model.fromDice?.dice2}
              reducedMotion={reducedMotion}
              trailMaterials={secondDieTrail}
            />
          </DiceAnimationClock>
        )
        : null}
    </group>
  );
}

export default memo(DiceLayer);
