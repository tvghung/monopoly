import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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
import DiceContactShadowBatch from './DiceContactShadowBatch';
import { DiceAnimationClock, useDiceAnimationProgressRef } from './diceAnimationClock';
import { useRenderQuality } from '../render/RenderQualityContext';

function DieBody() {
  const geometry = useMemo(() => createDiceBodyGeometry(), []);
  const { tier } = useRenderQuality();
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh name="DieBody" castShadow={tier === 'high'}>
      <primitive object={geometry} attach="geometry" />
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

function isValidDiceValue(dice: DiceValue): boolean {
  return isValidDiceFace(dice.dice1) && isValidDiceFace(dice.dice2);
}

function Die({
  dieIndex,
  value,
  phase,
  rollSequence,
  fromValue,
}: {
  dieIndex: 0 | 1;
  value: number;
  phase: DiceRenderModel['phase'];
  rollSequence: number;
  fromValue?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const progressRef = useDiceAnimationProgressRef();
  const basePosition = getDicePosition(dieIndex);
  const isRolling = phase === 'ROLLING';
  const hasPreviousDice = isValidDiceFace(fromValue ?? 0);

  useFrame(() => {
    if (!isRolling || !groupRef.current) return;
    const progress = progressRef.current.progress;
    const eased = easeOutCubic(progress);
    const rotation = getDiceAnimationRotation(value, rollSequence, dieIndex, progress, fromValue);
    groupRef.current.rotation.set(...rotation);
    groupRef.current.position.y = basePosition[1]
      + getDiceAnimationVerticalOffset(progress, hasPreviousDice);
    const scale = hasPreviousDice ? 1 : 0.86 + eased * 0.14;
    groupRef.current.scale.setScalar(scale);
  });

  const rotation = isRolling
    ? getDiceAnimationRotation(value, rollSequence, dieIndex, 0, fromValue)
    : getSettledDiceRotation(value);

  return (
    <group
      ref={groupRef}
      name={`ProceduralDie${dieIndex + 1}`}
      position={isRolling
        ? [basePosition[0], basePosition[1] + getDiceAnimationVerticalOffset(0, hasPreviousDice), basePosition[2]]
        : basePosition}
      rotation={rotation}
      scale={isRolling && !hasPreviousDice ? 0.86 : 1}
    >
      <DieBody />
      <DiePips />
    </group>
  );
}

export default function DiceLayer({ model }: { model: DiceRenderModel }) {
  const hasVisibleDice = model.phase !== 'HIDDEN' && isValidDiceValue(model.dice);

  return (
    <group
      name="DiceArena"
      userData={{
        coordinateSystem: 'board-world',
        centerFieldClearance: true,
      }}
    >
      {hasVisibleDice
        ? (
          <DiceAnimationClock
            phase={model.phase === 'ROLLING' ? 'ROLLING' : 'SETTLED'}
            rollSequence={model.rollSequence}
            durationMs={model.durationMs}
          >
            <DiceContactShadowBatch fromDice={model.fromDice} />
            <Die
              dieIndex={0}
              value={model.dice.dice1}
              phase={model.phase}
              rollSequence={model.rollSequence}
              fromValue={model.fromDice?.dice1}
            />
            <Die
              dieIndex={1}
              value={model.dice.dice2}
              phase={model.phase}
              rollSequence={model.rollSequence}
              fromValue={model.fromDice?.dice2}
            />
          </DiceAnimationClock>
        )
        : null}
    </group>
  );
}
