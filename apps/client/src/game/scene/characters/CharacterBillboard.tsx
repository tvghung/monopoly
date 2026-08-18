import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CharacterReactionSignal } from '../../presentation/store/types';
import type { CharacterPlayerModel } from '../board/boardRenderModel';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import { useTileMotionOffset } from '../board/motion/TileMotionProvider';
import { boardVisualTokens } from '../board/boardVisualTokens';
import {
  getCharacterLandingAnchor,
} from '../board/architecture/tileAnchors';
import { getCharacterDefinition } from '../../characters/characterRegistry';
import { acquireCharacterTexture } from '../../characters/characterTextureCache';
import { characterSvgDataUri } from '../../characters/characterSvg';
import { recordCharacterTextureDiagnostic } from '../../characters/characterTextureDiagnostics';
import {
  getCharacterGroundingTransforms,
  getCharacterTargetTransition,
  sampleCharacterMotion,
} from './characterMotion';
import { CharacterReactionController } from './characterReaction';
import CharacterSprite from './CharacterSprite';
import ContactShadow from '../fx/ContactShadow';
import { PLAYER_ACTIVE_RING_TUBE_RADIUS } from '../board/buildingPlacement';

interface CharacterBillboardProps {
  player: CharacterPlayerModel;
  slotIndex: number;
  occupantCount: number;
  resetEpoch: number;
  reaction?: CharacterReactionSignal;
}

interface CharacterMovement {
  from: THREE.Vector3;
  to: THREE.Vector3;
  elapsedMs: number;
}

function getTextureImageDimension(image: unknown, dimension: 'width' | 'height'): number {
  if (!image || typeof image !== 'object') return 0;
  const value = (image as Record<string, unknown>)[dimension];
  return typeof value === 'number' ? value : 0;
}

function snapCharacter(
  group: THREE.Group,
  ground: THREE.Group,
  body: THREE.Group,
  shadow: THREE.Group,
  target: THREE.Vector3,
  tileMotionOffsetY: number,
  shadowMaterial: THREE.MeshBasicMaterial | null,
  spriteMaterial: THREE.SpriteMaterial | null,
): void {
  group.position.set(target.x, 0, target.z);
  ground.position.set(0, target.y + tileMotionOffsetY, 0);
  body.position.set(0, target.y, 0);
  body.rotation.set(0, 0, 0);
  body.scale.set(1, 1, 1);
  shadow.scale.set(1, 1, 1);
  if (shadowMaterial) shadowMaterial.opacity = 0.24;
  if (spriteMaterial) spriteMaterial.opacity = spriteMaterial.map ? 1 : 0;
}

export default function CharacterBillboard({
  player,
  slotIndex,
  occupantCount,
  resetEpoch,
  reaction,
}: CharacterBillboardProps) {
  const groupRef = useRef<THREE.Group>(null);
  const groundGroupRef = useRef<THREE.Group>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const shadowGroupRef = useRef<THREE.Group>(null);
  const shadowMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const spriteMaterialRef = useRef<THREE.SpriteMaterial | null>(null);
  const movementRef = useRef<CharacterMovement | null>(null);
  const reactionControllerRef = useRef(new CharacterReactionController());
  const initializedRef = useRef(false);
  const previousTileIdRef = useRef<number | null>(null);
  const previousResetEpochRef = useRef<number | null>(null);
  const lastReactionSequenceRef = useRef<number | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const invalidate = useThree(state => state.invalidate);
  const reducedMotion = useEffectiveReducedMotion();
  const tileMotionOffsetY = useTileMotionOffset(player.tileId);
  const definition = getCharacterDefinition(player.characterId);
  const anchor = getCharacterLandingAnchor(player.tileId, slotIndex, occupantCount);
  const targetX = anchor?.[0];
  const targetY = anchor?.[1];
  const targetZ = anchor?.[2];
  const target = anchor ? new THREE.Vector3(...anchor) : null;

  useEffect(() => {
    setTexture(null);
    return acquireCharacterTexture(player.characterId, player.color, nextTexture => {
      setTexture(nextTexture);
      invalidate();
    }, () => {
      setTexture(null);
      invalidate();
    });
  }, [invalidate, player.characterId, player.color]);

  useEffect(() => {
    if (!texture) return;
    const rawSvg = definition.svgSource;
    recordCharacterTextureDiagnostic({
      key: `${player.characterId ?? 'legacy'}:${player.color}`,
      characterId: player.characterId,
      playerColor: player.color,
      svgSourceExists: rawSvg.length > 0,
      svgSourceLength: rawSvg.length,
      dataUriLength: characterSvgDataUri(rawSvg, player.color).length,
      stage: 'character-sprite-receives-texture',
      loaded: true,
      imageWidth: getTextureImageDimension(texture.image, 'width'),
      imageHeight: getTextureImageDimension(texture.image, 'height'),
    });
  }, [definition, player.characterId, player.color, texture]);

  useEffect(() => {
    const group = groupRef.current;
    const ground = groundGroupRef.current;
    const body = bodyGroupRef.current;
    const shadow = shadowGroupRef.current;
    const effectTarget = targetX === undefined || targetY === undefined || targetZ === undefined
      ? null
      : new THREE.Vector3(targetX, targetY, targetZ);
    if (!effectTarget || !group || !ground || !body || !shadow) return;

    const resetChanged = previousResetEpochRef.current !== null
      && previousResetEpochRef.current !== resetEpoch;
    previousResetEpochRef.current = resetEpoch;
    const transition = getCharacterTargetTransition(
      previousTileIdRef.current,
      player.tileId,
      resetChanged,
      reducedMotion,
    );
    previousTileIdRef.current = player.tileId;
    if (resetChanged) {
      reactionControllerRef.current.reset();
      lastReactionSequenceRef.current = null;
    }

    const targetXUnchanged = Math.abs(group.position.x - effectTarget.x) < 0.0001;
    const targetZUnchanged = Math.abs(group.position.z - effectTarget.z) < 0.0001;
    const movementTargetUnchanged = movementRef.current !== null
      && Math.abs(movementRef.current.to.x - effectTarget.x) < 0.0001
      && Math.abs(movementRef.current.to.z - effectTarget.z) < 0.0001;
    if (transition === 'NONE'
      && initializedRef.current
      && (targetXUnchanged && targetZUnchanged || movementTargetUnchanged)) {
      ground.position.set(0, effectTarget.y + tileMotionOffsetY, 0);
      invalidate();
      return;
    }

    if (transition === 'SNAP' || !initializedRef.current) {
      movementRef.current = null;
      snapCharacter(
        group,
        ground,
        body,
        shadow,
        effectTarget,
        tileMotionOffsetY,
        shadowMaterialRef.current,
        spriteMaterialRef.current,
      );
    } else {
      movementRef.current = {
        from: new THREE.Vector3(group.position.x, body.position.y, group.position.z),
        to: effectTarget,
        elapsedMs: 0,
      };
    }
    initializedRef.current = true;
    invalidate();
  }, [
    invalidate,
    occupantCount,
    player.tileId,
    reducedMotion,
    resetEpoch,
    slotIndex,
    tileMotionOffsetY,
    targetX,
    targetY,
    targetZ,
  ]);

  useEffect(() => {
    if (!reaction || reaction.sequence === lastReactionSequenceRef.current) return;
    lastReactionSequenceRef.current = reaction.sequence;
    reactionControllerRef.current.start(reaction.kind);
    invalidate();
  }, [invalidate, reaction]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    const ground = groundGroupRef.current;
    const body = bodyGroupRef.current;
    const shadow = shadowGroupRef.current;
    if (!group || !ground || !body || !shadow) return;

    const movement = movementRef.current;
    let bodyPosition = target ?? new THREE.Vector3(group.position.x, body.position.y, group.position.z);
    let bodyRotationZ = 0;
    let bodyScaleX = 1;
    let bodyScaleY = 1;
    let shadowScale = 1;
    let shadowOpacity = 0.24;
    let movementActive = false;
    if (movement) {
      movement.elapsedMs += delta * 1000;
      const sample = sampleCharacterMotion(movement.elapsedMs, movement.from, movement.to);
      bodyPosition = new THREE.Vector3(...sample.position);
      bodyRotationZ = sample.rotationZ;
      bodyScaleX = sample.scaleXZ;
      bodyScaleY = sample.scaleY;
      shadowScale = sample.shadowScale;
      shadowOpacity = sample.shadowOpacity;
      movementActive = !sample.done;
      if (sample.done) movementRef.current = null;
    }

    const reactionActive = reactionControllerRef.current.getState() !== null;
    const reactionSample = reactionControllerRef.current.advance(delta * 1000, reducedMotion);
    const grounding = getCharacterGroundingTransforms(
      [bodyPosition.x, bodyPosition.y, bodyPosition.z],
      target?.y ?? bodyPosition.y,
      tileMotionOffsetY,
    );
    group.position.set(...grounding.root);
    ground.position.set(...grounding.ground);
    body.position.set(grounding.body[0], grounding.body[1] + reactionSample.offsetY, grounding.body[2]);
    body.rotation.set(0, 0, bodyRotationZ + reactionSample.rotationZ);
    body.scale.set(
      bodyScaleX * reactionSample.scaleX,
      bodyScaleY * reactionSample.scaleY,
      bodyScaleX * reactionSample.scaleX,
    );
    shadow.scale.set(shadowScale, shadowScale, 1);
    if (shadowMaterialRef.current) shadowMaterialRef.current.opacity = shadowOpacity;
    if (spriteMaterialRef.current) {
      spriteMaterialRef.current.opacity = texture ? reactionSample.spriteOpacity : 0;
    }

    if (movementActive || reactionActive) invalidate();
  });

  const groundY = anchor?.[1] ?? 0;
  return (
    <group ref={groupRef}>
      <group ref={groundGroupRef} position={[0, groundY + tileMotionOffsetY, 0]}>
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
        <group ref={shadowGroupRef}>
          <ContactShadow
            scale={definition.shadowScale}
            opacity={0.24}
            materialRef={shadowMaterialRef}
            uniqueMaterial
          />
        </group>
      </group>
      <group ref={bodyGroupRef} position={[0, groundY, 0]}>
        <CharacterSprite
          texture={texture}
          definition={definition}
          materialRef={spriteMaterialRef}
        />
      </group>
    </group>
  );
}
