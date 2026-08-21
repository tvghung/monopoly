import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DiceValue } from '@monopoly/shared';
import RoundedBoxMesh from '../board/geometry/RoundedBoxMesh';
import { boardVisualTokens } from '../board/boardVisualTokens';
import SdfSurfaceText from '../board/tiles/SdfSurfaceText';
import type { DiceRenderModel } from '../board/boardRenderModel';
import {
  DICE_ARENA_CENTER_X,
  DICE_ARENA_CENTER_Z,
  DICE_ARENA_FLOOR_HEIGHT,
  DICE_ARENA_FLOOR_TOP_Y,
  DICE_ARENA_SIZE,
  DICE_DROP_HEIGHT,
  DICE_SIZE,
  getDicePosition,
  getDiceResultPosition,
} from './diceLayout';
import {
  easeOutCubic,
  getDiceAnimationRotation,
  getSettledDiceRotation,
  isValidDiceFace,
} from './diceOrientation';

const DIE_FACE_HALF = DICE_SIZE / 2;
const DIE_FACE_SIZE = DICE_SIZE * 0.88;
const PIP_RADIUS = DICE_SIZE * 0.075;
const PIP_OFFSET = DICE_SIZE * 0.22;
const DICE_BOUNCE_HEIGHT = DICE_SIZE * 0.13;

const PIP_POSITIONS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};

interface FaceSpec {
  value: number;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
}

function getFaceSpecs(): readonly FaceSpec[] {
  return [
    { value: 1, position: [0, DIE_FACE_HALF, 0], rotation: [-Math.PI / 2, 0, 0] },
    { value: 6, position: [0, -DIE_FACE_HALF, 0], rotation: [Math.PI / 2, 0, 0] },
    { value: 2, position: [0, 0, DIE_FACE_HALF], rotation: [0, 0, 0] },
    { value: 5, position: [0, 0, -DIE_FACE_HALF], rotation: [0, Math.PI, 0] },
    { value: 3, position: [DIE_FACE_HALF, 0, 0], rotation: [0, Math.PI / 2, 0] },
    { value: 4, position: [-DIE_FACE_HALF, 0, 0], rotation: [0, -Math.PI / 2, 0] },
  ];
}

function Pip({ row, column }: { row: number; column: number }) {
  return (
    <mesh
      position={[
        (column - 2) * PIP_OFFSET,
        (2 - row) * PIP_OFFSET,
        DICE_SIZE * 0.028,
      ]}
    >
      <sphereGeometry args={[PIP_RADIUS, 8, 6]} />
      <meshStandardMaterial color={boardVisualTokens.tileText} roughness={0.46} metalness={0.08} />
    </mesh>
  );
}

function DieFaces() {
  const faces = useMemo(() => getFaceSpecs(), []);
  return (
    <>
      {faces.map(face => (
        <mesh
          key={face.value}
          name={`DieFace${face.value}`}
          position={face.position}
          rotation={face.rotation}
        >
          <planeGeometry args={[DIE_FACE_SIZE, DIE_FACE_SIZE]} />
          <meshStandardMaterial color="#f6f0e1" roughness={0.38} metalness={0.04} />
          {PIP_POSITIONS[face.value].map(([row, column]) => (
            <Pip key={`${row}-${column}`} row={row} column={column} />
          ))}
        </mesh>
      ))}
    </>
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
}: {
  dieIndex: 0 | 1;
  value: number;
  phase: DiceRenderModel['phase'];
  rollSequence: number;
  durationMs: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree(state => state.invalidate);
  const animationStartRef = useRef<number | null>(null);
  const basePosition = getDicePosition(dieIndex);
  const isRolling = phase === 'ROLLING';

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
    const rotation = getDiceAnimationRotation(value, rollSequence, dieIndex, progress);
    groupRef.current.rotation.set(...rotation);
    groupRef.current.position.y = basePosition[1]
      + (1 - eased) * DICE_DROP_HEIGHT
      + bounce;
    const scale = 0.86 + eased * 0.14;
    groupRef.current.scale.setScalar(scale);
    if (progress < 1) invalidate();
  });

  const rotation = isRolling
    ? getDiceAnimationRotation(value, rollSequence, dieIndex, 0)
    : getSettledDiceRotation(value);

  return (
    <group
      ref={groupRef}
      name={`ProceduralDie${dieIndex + 1}`}
      position={isRolling
        ? [basePosition[0], basePosition[1] + DICE_DROP_HEIGHT, basePosition[2]]
        : basePosition}
      rotation={rotation}
      scale={isRolling ? 0.86 : 1}
    >
      <mesh name="DieBody">
        <boxGeometry args={[DICE_SIZE, DICE_SIZE, DICE_SIZE]} />
        <meshStandardMaterial color="#f0e5d0" roughness={0.42} metalness={0.04} />
      </mesh>
      <DieFaces />
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
      <RoundedBoxMesh
        name="DiceArenaSurface"
        width={DICE_ARENA_SIZE.width}
        height={DICE_ARENA_FLOOR_HEIGHT}
        depth={DICE_ARENA_SIZE.depth}
        radius={0.18}
        color={boardVisualTokens.airportTaxiway}
        materialProfile="centerWell"
        position={[
          DICE_ARENA_CENTER_X,
          DICE_ARENA_FLOOR_TOP_Y - DICE_ARENA_FLOOR_HEIGHT / 2,
          DICE_ARENA_CENTER_Z,
        ]}
      />
      {hasVisibleDice
        ? (
          <>
            <Die
              dieIndex={0}
              value={model.dice.dice1}
              phase={model.phase}
              rollSequence={model.rollSequence}
              durationMs={model.durationMs}
            />
            <Die
              dieIndex={1}
              value={model.dice.dice2}
              phase={model.phase}
              rollSequence={model.rollSequence}
              durationMs={model.durationMs}
            />
            {model.phase === 'SETTLED'
              ? (
                <SdfSurfaceText
                  name="DiceResultTotal"
                  value={String(model.dice.dice1 + model.dice.dice2)}
                  position={resultPosition}
                  fontSize={0.36}
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
