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
import { useSharedSvgTexture } from '../special/RaisedSvgTileIcon';
import SdfSurfaceText from '../board/tiles/SdfSurfaceText';
import {
  FIXED_CARD_BACK_QUATERNION,
} from '../camera/fixedCameraOrientation';
import {
  CARD_PRESENTATION_POSITION,
  CARD_PRESENTATION_SCALE,
  CARD_REVEAL_ROTATIONS,
  getCardLayerTransform,
  getIdleDeckCardCount,
  PHYSICAL_CARD_BEVEL,
  PHYSICAL_CARD_DEPTH,
  PHYSICAL_CARD_THICKNESS,
  PHYSICAL_CARD_WIDTH,
} from './physicalCardLayout';

const CARD_BODY_GEOMETRY = new RoundedBoxGeometry(
  PHYSICAL_CARD_WIDTH,
  PHYSICAL_CARD_THICKNESS,
  PHYSICAL_CARD_DEPTH,
  2,
  PHYSICAL_CARD_BEVEL,
);
const CARD_BACK_GEOMETRY = new THREE.PlaneGeometry(
  PHYSICAL_CARD_WIDTH * 0.94,
  PHYSICAL_CARD_DEPTH * 0.9,
);
CARD_BACK_GEOMETRY.rotateX(-Math.PI / 2);
CARD_BACK_GEOMETRY.translate(0, PHYSICAL_CARD_THICKNESS / 2 + 0.002, 0);
const CARD_FRONT_GEOMETRY = new THREE.PlaneGeometry(
  PHYSICAL_CARD_WIDTH * 0.94,
  PHYSICAL_CARD_DEPTH * 0.9,
);
CARD_FRONT_GEOMETRY.rotateX(Math.PI / 2);
CARD_FRONT_GEOMETRY.translate(0, -PHYSICAL_CARD_THICKNESS / 2 - 0.002, 0);
const CARD_BODY_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#eadfca', roughness: 0.66, metalness: 0.01,
});
const CARD_BACK_MATERIALS: Record<CardDeck, THREE.MeshStandardMaterial> = {
  chance: new THREE.MeshStandardMaterial({ color: '#d86843', roughness: 0.58, metalness: 0.01 }),
  chest: new THREE.MeshStandardMaterial({ color: '#159b8e', roughness: 0.58, metalness: 0.01 }),
};
const CARD_FRONT_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#fff1cf', roughness: 0.72, metalness: 0,
});
const CARD_BACK_ICON_GEOMETRY = new THREE.PlaneGeometry(
  PHYSICAL_CARD_WIDTH * 0.38,
  PHYSICAL_CARD_DEPTH * 0.54,
);
CARD_BACK_ICON_GEOMETRY.rotateX(-Math.PI / 2);
CARD_BACK_ICON_GEOMETRY.translate(0, PHYSICAL_CARD_THICKNESS / 2 + 0.004, 0);
const CARD_BACK_ICON_MATERIALS: Record<CardDeck, THREE.MeshBasicMaterial> = {
  chance: new THREE.MeshBasicMaterial({
    color: '#fff2d4', transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, toneMapped: false,
  }),
  chest: new THREE.MeshBasicMaterial({
    color: '#fff2d4', transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, toneMapped: false,
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
  }, [deck, texture]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const back = backRef.current;
    const iconMesh = iconRef.current;
    if (!body || !back) return;
    for (let index = 0; index < count; index += 1) {
      const transform = getCardLayerTransform(deck, index);
      object.position.set(...transform.position);
      object.rotation.set(0, transform.rotationY, 0);
      object.scale.set(1, 1, 1);
      object.updateMatrix();
      body.setMatrixAt(index, object.matrix);
      back.setMatrixAt(index, object.matrix);
      iconMesh?.setMatrixAt(index, object.matrix);
    }
    body.instanceMatrix.needsUpdate = true;
    back.instanceMatrix.needsUpdate = true;
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
        args={[CARD_BACK_GEOMETRY, CARD_BACK_MATERIALS[deck], count]}
        name={`${deck}CardBacks`}
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

function ActivePhysicalCard({
  signal,
  deckCounts,
  interaction,
}: {
  signal: CardPresentationSignal;
  deckCounts: DeckCounts;
  interaction: PhysicalCardInteraction;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsedRef = useRef(0);
  const invalidate = useThree(state => state.invalidate);
  const gl = useThree(state => state.gl);
  const sourceQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const spinQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const authoritativeDeckCount = deckCounts[signal.deck];
  const sourceTransform = useMemo(() => getCardLayerTransform(
    signal.deck,
    Math.max(0, authoritativeDeckCount - 1),
  ), [authoritativeDeckCount, signal.deck]);
  const card = signal.revealedCardId ? gameCardsById[signal.revealedCardId] : undefined;
  const icon = signal.deck === 'chance'
    ? BOARD_SVG_TILE_ICON_ASSETS['chance-question-svg']
    : BOARD_SVG_TILE_ICON_ASSETS['fortune-wheel-svg'];
  const iconTexture = useSharedSvgTexture(icon.url);

  useEffect(() => {
    const material = CARD_BACK_ICON_MATERIALS[signal.deck];
    material.map = iconTexture;
    material.needsUpdate = true;
  }, [iconTexture, signal.deck]);
  const interactive = signal.stage === 'AWAITING_DRAW'
    && interaction.canDraw
    && !interaction.drawPending;

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    elapsedRef.current = 0;
    if (signal.stage === 'DRAWING') {
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
  }, [invalidate, signal.operationId, signal.stage, sourceTransform.position, sourceTransform.rotationY, spinQuaternion]);

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
    if (signal.stage === 'DRAWING') {
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
      <mesh geometry={CARD_BACK_GEOMETRY} material={CARD_BACK_MATERIALS[signal.deck]} name="ActivePhysicalCardBack" />
      {iconTexture
        ? <mesh geometry={CARD_BACK_ICON_GEOMETRY} material={CARD_BACK_ICON_MATERIALS[signal.deck]} name="ActivePhysicalCardBackIcon" />
        : null}
      {signal.stage === 'REVEALING' || signal.stage === 'REVEALED'
        ? <mesh geometry={CARD_FRONT_GEOMETRY} material={CARD_FRONT_MATERIAL} name="ActivePhysicalCardFront" />
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
}: {
  signal: CardPresentationSignal | null;
  deckCounts: DeckCounts;
  interaction: PhysicalCardInteraction;
}) {
  const chanceCount = getIdleDeckCardCount('chance', deckCounts, signal);
  const chestCount = getIdleDeckCardCount('chest', deckCounts, signal);
  return (
    <group name="PhysicalCardDecks">
      <IdleDeckStack deck="chance" count={chanceCount} authoritativeCount={deckCounts.chance} />
      <IdleDeckStack deck="chest" count={chestCount} authoritativeCount={deckCounts.chest} />
      {signal
        ? (
          <ActivePhysicalCard signal={signal} deckCounts={deckCounts} interaction={interaction} />
        )
        : null}
    </group>
  );
}
