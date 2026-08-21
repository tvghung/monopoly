import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DiceValue } from '@monopoly/shared';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { boardVisualTokens } from '../board/boardVisualTokens';
import SdfSurfaceText from '../board/tiles/SdfSurfaceText';
import type { DiceRenderModel } from '../board/boardRenderModel';
import {
  DICE_SIZE,
  getDicePosition,
  getDiceResultPosition,
} from './diceLayout';
import {
  getDiceFaceSpecs,
  getDicePipInstances,
} from './diceGeometry';
import {
  easeOutCubic,
  getDiceAnimationHeight,
  getDiceAnimationRotation,
  getSettledDiceRotation,
  isValidDiceFace,
} from './diceOrientation';
import {
  DICE_BODY_COLOR,
  DICE_CORNER_SEGMENTS,
  DICE_EDGE_RADIUS,
  DICE_EDGE_SEGMENTS,
  DICE_FACE_COLOR,
  DICE_FACE_METALNESS,
  DICE_FACE_ROUGHNESS,
  DICE_FACE_SIZE,
  DICE_PIP_DEPTH_SCALE,
  DICE_PIP_RADIUS,
  DICE_RESULT_FONT_SIZE,
} from './diceVisualConfig';

const DICE_BOUNCE_HEIGHT = DICE_SIZE * 0.13;

function DieFaces() {
  const faces = useMemo(() => getDiceFaceSpecs(), []);
  return (
    <>
      {faces.map(face => (
        <mesh
          key={face.value}
          name={`DieFace${face.value}`}
          position={face.position}
          rotation={face.rotation}
        >
          <planeGeometry args={[DICE_FACE_SIZE, DICE_FACE_SIZE]} />
          <meshStandardMaterial
            color={DICE_FACE_COLOR}
            roughness={DICE_FACE_ROUGHNESS}
            metalness={DICE_FACE_METALNESS}
          />
        </mesh>
      ))}
    </>
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
    const scale = new THREE.Vector3(1, 1, DICE_PIP_DEPTH_SCALE);
    pips.forEach((pip, index) => {
      quaternion.setFromEuler(new THREE.Euler(...pip.rotation));
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
      <sphereGeometry args={[DICE_PIP_RADIUS, 8, 6]} />
      <meshStandardMaterial color={boardVisualTokens.tileText} roughness={0.46} metalness={0.08} />
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
  durationMs,
  fromValue,
}: {
  dieIndex: 0 | 1;
  value: number;
  phase: DiceRenderModel['phase'];
  rollSequence: number;
  durationMs: number;
  fromValue?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree(state => state.invalidate);
  const animationStartRef = useRef<number | null>(null);
  const basePosition = getDicePosition(dieIndex);
  const isRolling = phase === 'ROLLING';
  const hasPreviousDice = isValidDiceFace(fromValue ?? 0);

  useEffect(() => {
    animationStartRef.current = isRolling ? performance.now() : null;
    if (isRolling) invalidate();
  }, [invalidate, isRolling, rollSequence]);

  useFrame(() => {
    if (!isRolling || !groupRef.current || animationStartRef.current === null) return;
    const progress = durationMs <= 0
      ? 1
      : Math.min(1, Math.max(0, (performance.now() - animationStartRef.current) / durationMs));
    const eased = easeOutCubic(progress);
    const bounceProgress = progress <= 0.72 ? 0 : (progress - 0.72) / 0.28;
    const bounce = Math.sin(bounceProgress * Math.PI * 2.5)
      * DICE_BOUNCE_HEIGHT
      * (1 - Math.min(1, bounceProgress));
    const rotation = getDiceAnimationRotation(value, rollSequence, dieIndex, progress, fromValue);
    groupRef.current.rotation.set(...rotation);
    groupRef.current.position.y = basePosition[1]
      + getDiceAnimationHeight(progress, hasPreviousDice)
      + bounce;
    const scale = hasPreviousDice ? 1 : 0.86 + eased * 0.14;
    groupRef.current.scale.setScalar(scale);
    if (progress < 1) invalidate();
  });

  const rotation = isRolling
    ? getDiceAnimationRotation(value, rollSequence, dieIndex, 0, fromValue)
    : getSettledDiceRotation(value);

  return (
    <group
      ref={groupRef}
      name={`ProceduralDie${dieIndex + 1}`}
      position={isRolling
        ? [basePosition[0], basePosition[1] + getDiceAnimationHeight(0, hasPreviousDice), basePosition[2]]
        : basePosition}
      rotation={rotation}
      scale={isRolling && !hasPreviousDice ? 0.86 : 1}
    >
      <RoundedBoxMesh
        name="DieBody"
        width={DICE_SIZE}
        height={DICE_SIZE}
        depth={DICE_SIZE}
        radius={DICE_EDGE_RADIUS}
        segments={DICE_EDGE_SEGMENTS}
        cornerSegments={DICE_CORNER_SEGMENTS}
        color={DICE_BODY_COLOR}
        materialProfile="diceBody"
      />
      <DieFaces />
      <DiePips />
    </group>
  );
}

export default function DiceLayer({ model }: { model: DiceRenderModel }) {
  const hasVisibleDice = model.phase !== 'HIDDEN' && isValidDiceValue(model.dice);
  const resultPosition = getDiceResultPosition();

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
          <>
            <Die
              dieIndex={0}
              value={model.dice.dice1}
              phase={model.phase}
              rollSequence={model.rollSequence}
              durationMs={model.durationMs}
              fromValue={model.fromDice?.dice1}
            />
            <Die
              dieIndex={1}
              value={model.dice.dice2}
              phase={model.phase}
              rollSequence={model.rollSequence}
              durationMs={model.durationMs}
              fromValue={model.fromDice?.dice2}
            />
            {model.phase === 'SETTLED'
              ? (
                <SdfSurfaceText
                  name="DiceResultTotal"
                  value={String(model.dice.dice1 + model.dice.dice2)}
                  position={resultPosition}
                  fontSize={DICE_RESULT_FONT_SIZE}
                  maxWidth={0.9}
                  color={boardVisualTokens.tileText}
                />
              )
              : null}
          </>
        )
        : null}
    </group>
  );
}
