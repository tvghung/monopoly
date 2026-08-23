import {
  useEffect, useLayoutEffect, useMemo, useRef,
} from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { gameCardsById, type CardDeck, type DeckCounts } from '@monopoly/shared';
import * as THREE from 'three';
import type { CardPresentationSignal } from '../../presentation/store/types';
import { BOARD_SVG_TILE_ICON_ASSETS } from '../special/boardIconAssets';
import { prewarmSharedSvgTexture, useSharedSvgTexture } from '../special/RaisedSvgTileIcon';
import SdfSurfaceText from '../board/tiles/SdfSurfaceText';
import {
  FIXED_CARD_BACK_QUATERNION,
} from '../camera/fixedCameraOrientation';
import { CAMERA_RIGHT, CAMERA_UP } from '../camera/cameraMath';
import {
  CARD_PRESENTATION_POSITION,
  CARD_PRESENTATION_SCALE,
  CARD_FRAME_BORDER,
  CARD_REVEAL_ROTATIONS,
  DECK_ANCHORS,
  getCardFocusScale,
  getCardLayerTransform,
  getIdleDeckCardCount,
  PHYSICAL_CARD_BEVEL,
  PHYSICAL_CARD_DEPTH,
  PHYSICAL_CARD_THICKNESS,
  PHYSICAL_CARD_WIDTH,
} from './physicalCardLayout';

prewarmSharedSvgTexture(BOARD_SVG_TILE_ICON_ASSETS['chance-question-svg'].url);
prewarmSharedSvgTexture(BOARD_SVG_TILE_ICON_ASSETS['fortune-wheel-svg'].url);

const CARD_BODY_GEOMETRY = new RoundedBoxGeometry(
  PHYSICAL_CARD_WIDTH,
  PHYSICAL_CARD_THICKNESS,
  PHYSICAL_CARD_DEPTH,
  2,
  PHYSICAL_CARD_BEVEL,
);
const CARD_BACK_GEOMETRY = new THREE.PlaneGeometry(
  PHYSICAL_CARD_WIDTH * 0.9,
  PHYSICAL_CARD_DEPTH * 0.84,
);
CARD_BACK_GEOMETRY.rotateX(-Math.PI / 2);
CARD_BACK_GEOMETRY.translate(0, PHYSICAL_CARD_THICKNESS / 2 + 0.002, 0);
const CARD_FRONT_GEOMETRY = new THREE.PlaneGeometry(
  PHYSICAL_CARD_WIDTH * 0.9,
  PHYSICAL_CARD_DEPTH * 0.84,
);
CARD_FRONT_GEOMETRY.rotateX(Math.PI / 2);
CARD_FRONT_GEOMETRY.translate(0, -PHYSICAL_CARD_THICKNESS / 2 - 0.002, 0);
function createCardFrameGeometry(
  outerWidth: number,
  outerDepth: number,
  border: number,
  y: number,
  rotationX: number,
): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-outerWidth / 2, -outerDepth / 2);
  shape.lineTo(outerWidth / 2, -outerDepth / 2);
  shape.lineTo(outerWidth / 2, outerDepth / 2);
  shape.lineTo(-outerWidth / 2, outerDepth / 2);
  shape.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-outerWidth / 2 + border, -outerDepth / 2 + border);
  hole.lineTo(-outerWidth / 2 + border, outerDepth / 2 - border);
  hole.lineTo(outerWidth / 2 - border, outerDepth / 2 - border);
  hole.lineTo(outerWidth / 2 - border, -outerDepth / 2 + border);
  hole.closePath();
  shape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(rotationX);
  geometry.translate(0, y, 0);
  return geometry;
}
const CARD_BACK_FRAME_GEOMETRY = createCardFrameGeometry(
  PHYSICAL_CARD_WIDTH * 0.97,
  PHYSICAL_CARD_DEPTH * 0.93,
  CARD_FRAME_BORDER,
  PHYSICAL_CARD_THICKNESS / 2 + 0.005,
  -Math.PI / 2,
);
const CARD_FRONT_FRAME_GEOMETRY = createCardFrameGeometry(
  PHYSICAL_CARD_WIDTH * 0.97,
  PHYSICAL_CARD_DEPTH * 0.93,
  CARD_FRAME_BORDER,
  -PHYSICAL_CARD_THICKNESS / 2 - 0.005,
  Math.PI / 2,
);
const CARD_BODY_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#fbf8ef', roughness: 0.48, metalness: 0.01,
});
const CARD_FACE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#fffdf8', roughness: 0.42, metalness: 0,
});
const CARD_FRAME_MATERIALS: Record<CardDeck, THREE.MeshStandardMaterial> = {
  chance: new THREE.MeshStandardMaterial({ color: '#d9424d', roughness: 0.38, metalness: 0.02 }),
  chest: new THREE.MeshStandardMaterial({ color: '#0b9486', roughness: 0.38, metalness: 0.02 }),
};
const CARD_BACK_ICON_GEOMETRY = new THREE.PlaneGeometry(
  PHYSICAL_CARD_WIDTH * 0.38,
  PHYSICAL_CARD_DEPTH * 0.54,
);
CARD_BACK_ICON_GEOMETRY.rotateX(-Math.PI / 2);
CARD_BACK_ICON_GEOMETRY.translate(0, PHYSICAL_CARD_THICKNESS / 2 + 0.004, 0);
const CARD_BACK_ICON_MATERIALS: Record<CardDeck, THREE.MeshBasicMaterial> = {
  chance: new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, toneMapped: false,
  }),
  chest: new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, toneMapped: false,
  }),
};
const LOCAL_X_AXIS = new THREE.Vector3(1, 0, 0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface PhysicalCardInteraction {
  canDraw: boolean;
  drawPending: boolean;
  onDraw: (operationId: string) => void;
}

function IdleDeckStack({
  deck,
  count,
  authoritativeCount,
}: {
  deck: CardDeck;
  count: number;
  authoritativeCount: number;
}) {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const iconRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree(state => state.invalidate);
  const object = useMemo(() => new THREE.Object3D(), []);
  const icon = deck === 'chance'
    ? BOARD_SVG_TILE_ICON_ASSETS['chance-question-svg']
    : BOARD_SVG_TILE_ICON_ASSETS['fortune-wheel-svg'];
  const texture = useSharedSvgTexture(icon.url);

  useEffect(() => {
    const material = CARD_BACK_ICON_MATERIALS[deck];
    material.map = texture;
    material.needsUpdate = true;
    invalidate();
  }, [deck, invalidate, texture]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const back = backRef.current;
    const frame = frameRef.current;
    const iconMesh = iconRef.current;
    if (!body || !back || !frame) return;
    for (let index = 0; index < count; index += 1) {
      const transform = getCardLayerTransform(deck, index);
      object.position.set(...transform.position);
      object.rotation.set(0, transform.rotationY, 0);
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      body.setMatrixAt(index, object.matrix);
      back.setMatrixAt(index, object.matrix);
      frame.setMatrixAt(index, object.matrix);
      iconMesh?.setMatrixAt(index, object.matrix);
    }
    body.instanceMatrix.needsUpdate = true;
    back.instanceMatrix.needsUpdate = true;
    frame.instanceMatrix.needsUpdate = true;
    if (iconMesh) iconMesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [count, deck, invalidate, object, texture]);

  return (
    <group name={`${deck}PhysicalCardStack`} userData={{ physicalCount: count, authoritativeCount }}>
      <instancedMesh
        ref={bodyRef}
        args={[CARD_BODY_GEOMETRY, CARD_BODY_MATERIAL, count]}
        name={`${deck}CardBodies`}
      />
      <instancedMesh
        ref={backRef}
        args={[CARD_BACK_GEOMETRY, CARD_FACE_MATERIAL, count]}
        name={`${deck}CardBackSurfaces`}
      />
      <instancedMesh
        ref={frameRef}
        args={[CARD_BACK_FRAME_GEOMETRY, CARD_FRAME_MATERIALS[deck], count]}
        name={`${deck}CardBackFrames`}
      />
      {texture
        ? (
          <instancedMesh
            ref={iconRef}
            args={[CARD_BACK_ICON_GEOMETRY, CARD_BACK_ICON_MATERIALS[deck], count]}
            name={`${deck}CardBackIcons`}
          />
        )
        : null}
    </group>
  );
}

export function ActivePhysicalCard({
  signal,
  deckCounts,
  interaction,
  focus = false,
}: {
  signal: CardPresentationSignal;
  deckCounts: DeckCounts;
  interaction: PhysicalCardInteraction;
  focus?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  const gl = useThree(state => state.gl);
  const viewportWidth = useThree(state => state.viewport.width);
  const viewportHeight = useThree(state => state.viewport.height);
  const sourceQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const spinQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const focusQuaternion = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
    [],
  );
  const authoritativeDeckCount = deckCounts[signal.deck];
  const sourceTransform = useMemo(() => getCardLayerTransform(
    signal.deck,
    Math.max(0, authoritativeDeckCount - 1),
  ), [authoritativeDeckCount, signal.deck]);
  const focusStartPosition = useMemo(() => {
    const anchor = DECK_ANCHORS[signal.deck];
    const horizontal = anchor[0] * CAMERA_RIGHT[0] + anchor[1] * CAMERA_RIGHT[2];
    const vertical = anchor[0] * CAMERA_UP[0] + anchor[1] * CAMERA_UP[2];
    const axisLimit = Math.max(
      0.001,
      Math.hypot(DECK_ANCHORS.chance[0], DECK_ANCHORS.chance[1]),
    );
    return [
      horizontal / axisLimit * viewportWidth * 0.33,
      vertical / axisLimit * viewportHeight * 0.25,
      0,
    ] as const;
  }, [signal.deck, viewportHeight, viewportWidth]);
  const focusScale = getCardFocusScale(viewportWidth, viewportHeight);
  const card = signal.revealedCardId ? gameCardsById[signal.revealedCardId] : undefined;
  const icon = signal.deck === 'chance'
    ? BOARD_SVG_TILE_ICON_ASSETS['chance-question-svg']
    : BOARD_SVG_TILE_ICON_ASSETS['fortune-wheel-svg'];
  const iconTexture = useSharedSvgTexture(icon.url);

  useEffect(() => {
    const material = CARD_BACK_ICON_MATERIALS[signal.deck];
    material.map = iconTexture;
    material.needsUpdate = true;
    invalidate();
  }, [iconTexture, invalidate, signal.deck]);
  const interactive = signal.stage === 'AWAITING_DRAW'
    && interaction.canDraw
    && !interaction.drawPending;

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    elapsedRef.current = 0;
    if (focus) {
      group.position.set(...(signal.stage === 'DRAWING' ? focusStartPosition : [0, 0, 0] as const));
      group.quaternion.copy(focusQuaternion);
      if (signal.stage === 'REVEALED') {
        spinQuaternion.setFromAxisAngle(LOCAL_X_AXIS, Math.PI * CARD_REVEAL_ROTATIONS * 2);
        group.quaternion.multiply(spinQuaternion);
      }
      group.scale.setScalar(signal.stage === 'DRAWING' ? focusScale * 0.48 : focusScale);
    } else if (signal.stage === 'DRAWING') {
      group.position.set(...sourceTransform.position);
      group.rotation.set(0, sourceTransform.rotationY, 0);
      group.scale.setScalar(1);
    } else {
      group.position.set(...CARD_PRESENTATION_POSITION);
      group.quaternion.copy(FIXED_CARD_BACK_QUATERNION);
      if (signal.stage === 'REVEALED') {
        spinQuaternion.setFromAxisAngle(LOCAL_X_AXIS, Math.PI * CARD_REVEAL_ROTATIONS * 2);
        group.quaternion.multiply(spinQuaternion);
      }
      group.scale.setScalar(CARD_PRESENTATION_SCALE);
    }
    invalidate();
  }, [focus, focusQuaternion, focusScale, focusStartPosition, invalidate, signal.operationId, signal.stage, sourceTransform.position, sourceTransform.rotationY, spinQuaternion]);

  useEffect(() => () => {
    if (gl.domElement.style.cursor === 'pointer') gl.domElement.style.cursor = '';
  }, [gl]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || signal.durationMs <= 0) return;
    if (signal.stage !== 'DRAWING' && signal.stage !== 'REVEALING') return;
    elapsedRef.current += delta * 1000;
    const progress = THREE.MathUtils.clamp(elapsedRef.current / signal.durationMs, 0, 1);
    const eased = 1 - (1 - progress) ** 3;
    if (focus && signal.stage === 'DRAWING') {
      group.position.set(
        THREE.MathUtils.lerp(focusStartPosition[0], 0, eased),
        THREE.MathUtils.lerp(focusStartPosition[1], 0, eased),
        0,
      );
      group.quaternion.copy(focusQuaternion);
      group.scale.setScalar(THREE.MathUtils.lerp(focusScale * 0.48, focusScale, eased));
    } else if (focus) {
      group.position.set(0, 0, 0);
      spinQuaternion.setFromAxisAngle(
        LOCAL_X_AXIS,
        Math.PI * CARD_REVEAL_ROTATIONS * 2 * eased,
      );
      group.quaternion.copy(focusQuaternion).multiply(spinQuaternion);
      group.scale.setScalar(focusScale * (1 + Math.sin(progress * Math.PI) * 0.055));
    } else if (signal.stage === 'DRAWING') {
      group.position.set(
        THREE.MathUtils.lerp(sourceTransform.position[0], CARD_PRESENTATION_POSITION[0], eased),
        THREE.MathUtils.lerp(sourceTransform.position[1], CARD_PRESENTATION_POSITION[1], eased)
          + Math.sin(progress * Math.PI) * 0.48,
        THREE.MathUtils.lerp(sourceTransform.position[2], CARD_PRESENTATION_POSITION[2], eased),
      );
      sourceQuaternion.setFromAxisAngle(WORLD_UP, sourceTransform.rotationY);
      group.quaternion.slerpQuaternions(sourceQuaternion, FIXED_CARD_BACK_QUATERNION, eased);
      group.scale.setScalar(THREE.MathUtils.lerp(1, CARD_PRESENTATION_SCALE, eased));
    } else {
      group.position.set(...CARD_PRESENTATION_POSITION);
      spinQuaternion.setFromAxisAngle(
        LOCAL_X_AXIS,
        Math.PI * CARD_REVEAL_ROTATIONS * 2 * eased,
      );
      group.quaternion.copy(FIXED_CARD_BACK_QUATERNION).multiply(spinQuaternion);
      group.scale.setScalar(CARD_PRESENTATION_SCALE * (1 + Math.sin(progress * Math.PI) * 0.055));
    }
    if (progress < 1) invalidate();
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (interactive) interaction.onDraw(signal.operationId);
  };
  const handlePointerEnter = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (interactive && event.nativeEvent.target instanceof HTMLElement) {
      event.nativeEvent.target.style.cursor = 'pointer';
    }
  };
  const handlePointerLeave = (event: ThreeEvent<PointerEvent>) => {
    if (event.nativeEvent.target instanceof HTMLElement) {
      event.nativeEvent.target.style.cursor = '';
    }
  };

  return (
    <group
      ref={groupRef}
      name={`ActivePhysicalCard:${signal.operationId}`}
      userData={{ stage: signal.stage, deck: signal.deck, physical: true }}
      onClick={handleClick}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <mesh geometry={CARD_BODY_GEOMETRY} material={CARD_BODY_MATERIAL} name="ActivePhysicalCardBody" />
      <mesh geometry={CARD_BACK_GEOMETRY} material={CARD_FACE_MATERIAL} name="ActivePhysicalCardBackSurface" />
      <mesh geometry={CARD_BACK_FRAME_GEOMETRY} material={CARD_FRAME_MATERIALS[signal.deck]} name="ActivePhysicalCardBackFrame" />
      {iconTexture
        ? <mesh geometry={CARD_BACK_ICON_GEOMETRY} material={CARD_BACK_ICON_MATERIALS[signal.deck]} name="ActivePhysicalCardBackIcon" />
        : null}
      {signal.stage === 'REVEALING' || signal.stage === 'REVEALED'
        ? (
          <>
            <mesh geometry={CARD_FRONT_GEOMETRY} material={CARD_FACE_MATERIAL} name="ActivePhysicalCardFrontSurface" />
            <mesh geometry={CARD_FRONT_FRAME_GEOMETRY} material={CARD_FRAME_MATERIALS[signal.deck]} name="ActivePhysicalCardFrontFrame" />
          </>
        )
        : null}
      {card
        ? (
          <SdfSurfaceText
            value={card.message}
            position={[0, -PHYSICAL_CARD_THICKNESS / 2 - 0.006, 0]}
            fontSize={0.125}
            maxWidth={1.48}
            maxHeight={0.82}
            lineHeight={1.12}
            rotationX={Math.PI / 2}
            color="#173d43"
            renderOrder={2}
            name="ActivePhysicalCardMessage"
          />
        )
        : null}
    </group>
  );
}

export default function PhysicalCardDecks({
  signal,
  deckCounts,
  interaction,
  renderActiveCard = true,
}: {
  signal: CardPresentationSignal | null;
  deckCounts: DeckCounts;
  interaction: PhysicalCardInteraction;
  renderActiveCard?: boolean;
}) {
  const chanceCount = getIdleDeckCardCount('chance', deckCounts, signal);
  const chestCount = getIdleDeckCardCount('chest', deckCounts, signal);
  return (
    <group name="PhysicalCardDecks">
      <IdleDeckStack deck="chance" count={chanceCount} authoritativeCount={deckCounts.chance} />
      <IdleDeckStack deck="chest" count={chestCount} authoritativeCount={deckCounts.chest} />
      {signal && renderActiveCard
        ? (
          <ActivePhysicalCard signal={signal} deckCounts={deckCounts} interaction={interaction} />
        )
        : null}
    </group>
  );
}
