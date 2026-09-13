import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { type CardDeck, type DeckCounts } from '@monopoly/shared';
import * as THREE from 'three';
import { BOARD_SVG_TILE_ICON_ASSETS } from '../special/boardIconAssets';
import { prewarmSharedSvgTexture, useSharedSvgTexture } from '../special/RaisedSvgTileIcon';
import {
  CARD_FRAME_BORDER,
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

function createCardFrameGeometry(
  outerWidth: number,
  outerDepth: number,
  border: number,
  y: number,
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
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

const CARD_BACK_FRAME_GEOMETRY = createCardFrameGeometry(
  PHYSICAL_CARD_WIDTH * 0.97,
  PHYSICAL_CARD_DEPTH * 0.93,
  CARD_FRAME_BORDER,
  PHYSICAL_CARD_THICKNESS / 2 + 0.005,
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

export default function PhysicalCardDecks({ deckCounts }: { deckCounts: DeckCounts }) {
  const chanceCount = getIdleDeckCardCount('chance', deckCounts);
  const chestCount = getIdleDeckCardCount('chest', deckCounts);
  return (
    <group name="PhysicalCardDecks">
      <IdleDeckStack deck="chance" count={chanceCount} authoritativeCount={deckCounts.chance} />
      <IdleDeckStack deck="chest" count={chestCount} authoritativeCount={deckCounts.chest} />
    </group>
  );
}
