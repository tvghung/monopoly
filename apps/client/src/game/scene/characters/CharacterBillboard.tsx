import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CharacterPlayerModel } from '../board/boardRenderModel';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import { useTileMotionOffset } from '../board/motion/TileMotionProvider';
import { boardVisualTokens } from '../board/boardVisualTokens';
import {
  CHARACTER_BILLBOARD_HEIGHT,
  getCharacterLandingAnchor,
} from '../board/architecture/tileAnchors';
import { getCharacterDefinition } from '../../characters/characterRegistry';
import { acquireCharacterTexture } from '../../characters/characterTextureCache';
import { getPlayerDisplayColor } from '../../ui/playerVisualColors';
import { sampleCharacterMotion } from './characterMotion';
import ContactShadow from '../fx/ContactShadow';
import {
  PLAYER_ACTIVE_RING_TUBE_RADIUS,
} from '../board/buildingPlacement';

interface CharacterBillboardProps {
  player: CharacterPlayerModel;
  slotIndex: number;
  occupantCount: number;
  resetEpoch: number;
}

interface CharacterMovement {
  from: THREE.Vector3;
  to: THREE.Vector3;
  elapsedMs: number;
}

export default function CharacterBillboard({
  player,
  slotIndex,
  occupantCount,
  resetEpoch,
}: CharacterBillboardProps) {
  const groupRef = useRef<THREE.Group>(null);
  const shadowGroupRef = useRef<THREE.Group>(null);
  const shadowMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const movementRef = useRef<CharacterMovement | null>(null);
  const initializedRef = useRef(false);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const invalidate = useThree(state => state.invalidate);
  const reducedMotion = useEffectiveReducedMotion();
  const tileMotionOffsetY = useTileMotionOffset(player.tileId);
  const definition = getCharacterDefinition(player.characterId);
  const displayColor = getPlayerDisplayColor(player.color);

  useEffect(() => {
    setTexture(null);
    return acquireCharacterTexture(player.characterId, player.color, nextTexture => {
      setTexture(nextTexture);
      invalidate();
    });
  }, [invalidate, player.characterId, player.color]);

  useEffect(() => {
    const position = getCharacterLandingAnchor(player.tileId, slotIndex, occupantCount);
    const group = groupRef.current;
    if (!position || !group) return;

    const target = new THREE.Vector3(...position);
    if (reducedMotion || !initializedRef.current) {
      group.position.copy(target);
      group.rotation.set(0, 0, 0);
      group.scale.set(1, 1, 1);
      shadowGroupRef.current?.scale.set(1, 1, 1);
      if (shadowMaterialRef.current) shadowMaterialRef.current.opacity = 0.24;
      movementRef.current = null;
    } else {
      movementRef.current = {
        from: group.position.clone(),
        to: target,
        elapsedMs: 0,
      };
    }
    initializedRef.current = true;
    invalidate();
  }, [invalidate, occupantCount, player.tileId, reducedMotion, resetEpoch, slotIndex]);

  useFrame((_, delta) => {
    const movement = movementRef.current;
    const group = groupRef.current;
    if (!movement || !group) return;
    movement.elapsedMs += delta * 1000;
    const sample = sampleCharacterMotion(movement.elapsedMs, movement.from, movement.to);
    group.position.set(...sample.position);
    group.rotation.z = sample.rotationZ;
    group.scale.set(sample.scaleXZ, sample.scaleY, sample.scaleXZ);
    shadowGroupRef.current?.scale.set(sample.shadowScale, sample.shadowScale, 1);
    if (shadowMaterialRef.current) shadowMaterialRef.current.opacity = sample.shadowOpacity;
    invalidate();
    if (sample.done) {
      group.position.copy(movement.to);
      group.rotation.set(0, 0, 0);
      group.scale.set(1, 1, 1);
      shadowGroupRef.current?.scale.set(1, 1, 1);
      if (shadowMaterialRef.current) shadowMaterialRef.current.opacity = 0.24;
      movementRef.current = null;
    }
  });

  return (
    <group ref={groupRef}>
      <group position={[0, tileMotionOffsetY, 0]}>
        {player.isActive
          ? (
            <mesh position={[0, 0.025, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.32, PLAYER_ACTIVE_RING_TUBE_RADIUS, 8, 24]} />
              <meshStandardMaterial
                color={boardVisualTokens.selection}
                emissive={boardVisualTokens.selection}
                emissiveIntensity={0.2}
              />
            </mesh>
          )
          : null}
        <sprite
          position={[0, CHARACTER_BILLBOARD_HEIGHT / 2 + definition.verticalOffset, 0]}
          scale={[definition.scale * 0.96, definition.scale * CHARACTER_BILLBOARD_HEIGHT, 1]}
        >
          <spriteMaterial
            map={texture ?? undefined}
            color={displayColor}
            transparent
            opacity={texture ? 1 : 0}
            alphaTest={0.04}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
        <group ref={shadowGroupRef}>
          <ContactShadow
            scale={definition.shadowScale}
            opacity={0.24}
            materialRef={shadowMaterialRef}
            uniqueMaterial
          />
        </group>
      </group>
    </group>
  );
}
