import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type {
  CharacterLandingSignal,
  CharacterMovementSignal,
  CharacterReactionSignal,
} from '../../presentation/store/types';
import type { CharacterPlayerModel } from '../board/boardRenderModel';
import { useEffectiveReducedMotion } from '../../../settings/selectors';
import { useTileMotionController } from '../board/motion/TileMotionProvider';
import { getCharacterLandingAnchor } from '../board/architecture/tileAnchors';
import { getCharacterDefinition } from '../../characters/characterRegistry';
import { acquireCharacterTexture } from '../../characters/characterTextureCache';
import {
  CHARACTER_SHADOW_OPACITY,
  CHARACTER_SLOT_REFLOW_DURATION_MS,
  getCharacterBodyTileOffsetY,
  getCharacterGroundingTransforms,
  getCharacterTargetTransition,
  sampleCharacterHop,
  sampleCharacterJailTransfer,
  sampleCharacterLanding,
  sampleCharacterSlotReflow,
} from './characterMotion';
import { resolvePresentationDuration } from '../../presentation/timings';
import { getAnimationElapsedMs } from '../animationTime';
import { CharacterReactionController } from './characterReaction';
import CharacterStandee, { applyStandeeOpacity } from './CharacterStandee';
import { syncStandeeBasesNow } from './standeeBaseRegistry';
import { STANDEE_HEADING_Y } from './standeeMaterial';
import ContactShadow from '../fx/ContactShadow';
import { useRenderQuality } from '../render/RenderQualityContext';
import { recordCharacterMovementTrace } from '../../presentation/movementTrace';

interface CharacterBillboardProps {
  player: CharacterPlayerModel;
  slotIndex: number;
  occupantCount: number;
  movementSignals: readonly CharacterMovementSignal[];
  landingSignals: readonly CharacterLandingSignal[];
  animationSpeedMultiplier: number;
  resetEpoch: number;
  reaction?: CharacterReactionSignal;
}

type CharacterMotionKind = 'TILE_HOP' | 'JAIL_TRANSFER' | 'SLOT_REFLOW';

interface ActiveCharacterMotion {
  kind: CharacterMotionKind;
  sequence: number;
  fromTileId: number;
  toTileId: number;
  rollSequence?: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  startedAtMs: number;
  durationMs: number;
}

interface ActiveLanding {
  startedAtMs: number;
  durationMs: number;
}

function snapCharacter(
  group: THREE.Group,
  ground: THREE.Group,
  body: THREE.Group,
  shadow: THREE.Group,
  target: THREE.Vector3,
  tileMotionOffsetY: number,
  shadowMaterial: THREE.MeshBasicMaterial | null,
  spriteMaterial: THREE.MeshBasicMaterial | null,
): void {
  group.position.set(target.x, 0, target.z);
  ground.position.set(0, target.y + tileMotionOffsetY, 0);
  body.position.set(0, target.y, 0);
  body.rotation.set(0, STANDEE_HEADING_Y, 0);
  body.scale.set(1, 1, 1);
  shadow.scale.set(1, 1, 1);
  if (shadowMaterial) shadowMaterial.opacity = CHARACTER_SHADOW_OPACITY;
  if (spriteMaterial) applyStandeeOpacity(spriteMaterial, spriteMaterial.map ? 1 : 0);
}

function signalAnchor(
  tileId: number,
  slotIndex: number,
  occupantCount: number,
): THREE.Vector3 | null {
  const anchor = getCharacterLandingAnchor(tileId, slotIndex, occupantCount);
  return anchor ? new THREE.Vector3(...anchor) : null;
}

export default function CharacterBillboard({
  player,
  slotIndex,
  occupantCount,
  movementSignals,
  landingSignals,
  animationSpeedMultiplier,
  resetEpoch,
  reaction,
}: CharacterBillboardProps) {
  const groupRef = useRef<THREE.Group>(null);
  const groundGroupRef = useRef<THREE.Group>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const shadowGroupRef = useRef<THREE.Group>(null);
  const shadowMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const spriteMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const activeMotionRef = useRef<ActiveCharacterMotion | null>(null);
  const activeLandingRef = useRef<ActiveLanding | null>(null);
  const reactionControllerRef = useRef(new CharacterReactionController());
  const initializedRef = useRef(false);
  const previousTileIdRef = useRef<number | null>(null);
  const previousAnchorRef = useRef<THREE.Vector3 | null>(null);
  const previousResetEpochRef = useRef<number | null>(null);
  const movementSequenceRef = useRef(0);
  const landingSequenceRef = useRef(0);
  const lastReactionSequenceRef = useRef<number | null>(null);
  const frameSequenceRef = useRef(0);
  const bodyPositionScratchRef = useRef(new THREE.Vector3());
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const invalidate = useThree(state => state.invalidate);
  const reducedMotion = useEffectiveReducedMotion();
  const { buildingContactShadows } = useRenderQuality();
  const tileMotionController = useTileMotionController();
  const tileMotionOffsetYSnapshot = tileMotionController?.getTileOffsetY(player.tileId) ?? 0;
  const definition = getCharacterDefinition(player.characterId);
  const anchor = getCharacterLandingAnchor(player.tileId, slotIndex, occupantCount);
  const targetX = anchor?.[0];
  const targetY = anchor?.[1];
  const targetZ = anchor?.[2];

  // The card faces the camera azimuth; the lean (rotation about Z) is applied after the heading, so it tilts the card sideways.
  useLayoutEffect(() => {
    const body = bodyGroupRef.current;
    if (!body) return;
    body.rotation.order = 'YXZ';
    body.rotation.set(0, STANDEE_HEADING_Y, 0);
  }, []);

  useEffect(() => {
    recordCharacterMovementTrace({ stage: 'SCENE_MOUNT', playerId: player.playerId });
    return () => recordCharacterMovementTrace({ stage: 'SCENE_UNMOUNT', playerId: player.playerId });
  }, [player.playerId]);

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

  useLayoutEffect(() => {
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

    if (resetChanged) {
      activeMotionRef.current = null;
      activeLandingRef.current = null;
      reactionControllerRef.current.reset();
      lastReactionSequenceRef.current = null;
      movementSequenceRef.current = movementSignals.at(-1)?.sequence ?? 0;
      landingSequenceRef.current = landingSignals.at(-1)?.sequence ?? 0;
      snapCharacter(
        group,
        ground,
        body,
        shadow,
        effectTarget,
        tileMotionOffsetYSnapshot,
        shadowMaterialRef.current,
        spriteMaterialRef.current,
      );
      initializedRef.current = true;
      previousTileIdRef.current = player.tileId;
      previousAnchorRef.current = effectTarget.clone();
      invalidate();
      return;
    }

    if (!initializedRef.current) {
      snapCharacter(
        group,
        ground,
        body,
        shadow,
        effectTarget,
        tileMotionOffsetYSnapshot,
        shadowMaterialRef.current,
        spriteMaterialRef.current,
      );
      initializedRef.current = true;
      previousTileIdRef.current = player.tileId;
      previousAnchorRef.current = effectTarget.clone();
      movementSequenceRef.current = movementSignals.at(-1)?.sequence ?? 0;
      landingSequenceRef.current = landingSignals.at(-1)?.sequence ?? 0;
      invalidate();
      return;
    }

    const pendingMovementSignals = movementSignals
      .filter(signal => signal.sequence > movementSequenceRef.current)
      .sort((left, right) => left.sequence - right.sequence);
    let movementSignalHandled = false;
    pendingMovementSignals.forEach(signal => {
      movementSequenceRef.current = signal.sequence;
      movementSignalHandled = true;
      recordCharacterMovementTrace({
        stage: signal.transition === 'SNAP'
          ? 'BILLBOARD_SNAP'
          : signal.phase === 'START' ? 'BILLBOARD_START' : 'BILLBOARD_COMPLETE',
        playerId: player.playerId,
        sequence: signal.sequence,
        transition: signal.transition,
        fromTileId: signal.fromTileId,
        toTileId: signal.toTileId,
        playerTileId: player.tileId,
        durationMs: signal.durationMs,
        rollSequence: signal.rollSequence,
        resetEpoch,
        displayTileId: player.tileId,
        settledTileId: player.settledTileId,
        targetAnchor: effectTarget.toArray(),
        position: [group.position.x, body.position.y, group.position.z],
      });
      if (signal.transition === 'SNAP') {
        activeMotionRef.current = null;
        activeLandingRef.current = null;
        snapCharacter(
          group,
          ground,
          body,
          shadow,
          effectTarget,
          tileMotionOffsetYSnapshot,
          shadowMaterialRef.current,
          spriteMaterialRef.current,
        );
        return;
      }

      if (signal.phase === 'START') {
        const from = new THREE.Vector3(
          group.position.x,
          group.position.y + body.position.y,
          group.position.z,
        );
        const to = signalAnchor(
          signal.toTileId,
          signal.toSlotIndex,
          signal.toOccupantCount,
        );
        if (!from || !to) {
          activeMotionRef.current = null;
          snapCharacter(
            group,
            ground,
            body,
            shadow,
            effectTarget,
            tileMotionOffsetYSnapshot,
            shadowMaterialRef.current,
            spriteMaterialRef.current,
          );
          return;
        }
        activeLandingRef.current = null;
        activeMotionRef.current = {
          kind: signal.transition === 'JAIL_TRANSFER' ? 'JAIL_TRANSFER' : 'TILE_HOP',
          sequence: signal.sequence,
          fromTileId: signal.fromTileId,
          toTileId: signal.toTileId,
          rollSequence: signal.rollSequence,
          from,
          to,
          startedAtMs: signal.startedAtMs ?? performance.now(),
          durationMs: signal.durationMs,
        };
        return;
      }

      const to = signalAnchor(
        signal.toTileId,
        signal.toSlotIndex,
        signal.toOccupantCount,
      ) ?? effectTarget;
      activeMotionRef.current = null;
      snapCharacter(
        group,
        ground,
        body,
        shadow,
        to,
        tileMotionOffsetYSnapshot,
        shadowMaterialRef.current,
        spriteMaterialRef.current,
      );
    });

    const pendingLandingSignals = landingSignals
      .filter(signal => signal.sequence > landingSequenceRef.current)
      .sort((left, right) => left.sequence - right.sequence);
    pendingLandingSignals.forEach(signal => {
      landingSequenceRef.current = signal.sequence;
      if (signal.tileId !== player.tileId || reducedMotion) {
        activeLandingRef.current = null;
        return;
      }
      activeLandingRef.current = {
        startedAtMs: performance.now(),
        durationMs: signal.durationMs,
      };
    });

    const previousTileId = previousTileIdRef.current;
    const previousAnchor = previousAnchorRef.current;
    const anchorChanged = previousAnchor !== null
      && previousAnchor.distanceTo(effectTarget) > 0.0001;
    const transition = getCharacterTargetTransition(
      previousTileId,
      player.tileId,
      false,
      reducedMotion,
      anchorChanged,
    );

    if (!movementSignalHandled && transition === 'SNAP') {
      activeMotionRef.current = null;
      activeLandingRef.current = null;
      snapCharacter(
        group,
        ground,
        body,
        shadow,
        effectTarget,
        tileMotionOffsetYSnapshot,
        shadowMaterialRef.current,
        spriteMaterialRef.current,
      );
    } else if (!movementSignalHandled && transition === 'TILE_HOP') {
      // A tile changed without a presentation segment. Correct to state rather
      // than inventing a hop from the current rendered transform.
      activeMotionRef.current = null;
      activeLandingRef.current = null;
      snapCharacter(
        group,
        ground,
        body,
        shadow,
        effectTarget,
        tileMotionOffsetYSnapshot,
        shadowMaterialRef.current,
        spriteMaterialRef.current,
      );
    } else if (
      !movementSignalHandled
      && transition === 'SLOT_REFLOW'
      && previousAnchor
      && activeMotionRef.current === null
    ) {
      activeMotionRef.current = {
        kind: 'SLOT_REFLOW',
        sequence: movementSequenceRef.current,
        fromTileId: player.tileId,
        toTileId: player.tileId,
        from: previousAnchor.clone(),
        to: effectTarget.clone(),
        startedAtMs: performance.now(),
        durationMs: resolvePresentationDuration(CHARACTER_SLOT_REFLOW_DURATION_MS, animationSpeedMultiplier),
      };
    }

    previousTileIdRef.current = player.tileId;
    previousAnchorRef.current = effectTarget.clone();
    invalidate();
  }, [
    animationSpeedMultiplier,
    invalidate,
    landingSignals,
    movementSignals,
    occupantCount,
    player.playerId,
    player.settledTileId,
    player.tileId,
    reducedMotion,
    resetEpoch,
    slotIndex,
    targetX,
    targetY,
    targetZ,
    tileMotionController,
    tileMotionOffsetYSnapshot,
  ]);

  useLayoutEffect(() => {
    if (!reaction || reaction.sequence === lastReactionSequenceRef.current) return;
    lastReactionSequenceRef.current = reaction.sequence;
    reactionControllerRef.current.start(reaction.kind, reaction.durationMs);
    invalidate();
  }, [invalidate, reaction]);

  useFrame((state, delta) => {
    const nowMs = performance.now();
    const frameSequence = ++frameSequenceRef.current;
    const group = groupRef.current;
    const ground = groundGroupRef.current;
    const body = bodyGroupRef.current;
    const shadow = shadowGroupRef.current;
    if (!group || !ground || !body || !shadow) return;

    const bodyPosition = bodyPositionScratchRef.current;
    if (targetX === undefined || targetY === undefined || targetZ === undefined) {
      bodyPosition.set(group.position.x, body.position.y, group.position.z);
    } else {
      bodyPosition.set(targetX, targetY, targetZ);
    }

    let bodyRotationZ = 0;
    let bodyScaleX = 1;
    let bodyScaleY = 1;
    let shadowScale = 1;
    let shadowOpacity = CHARACTER_SHADOW_OPACITY;
    let movementActive = false;

    const motion = activeMotionRef.current;
    const latestMovement = movementSignals.at(-1);
    const pendingSignal = latestMovement?.phase === 'START'
      && latestMovement.sequence > movementSequenceRef.current
      ? latestMovement
      : null;
    if (motion) {
      const elapsedMs = getAnimationElapsedMs(motion.startedAtMs, nowMs);
      const sample = motion.kind === 'TILE_HOP'
        ? sampleCharacterHop(elapsedMs, motion.from, motion.to, motion.durationMs)
        : motion.kind === 'JAIL_TRANSFER'
          ? sampleCharacterJailTransfer(elapsedMs, motion.from, motion.to, motion.durationMs)
          : sampleCharacterSlotReflow(elapsedMs, motion.from, motion.to, motion.durationMs);
      bodyPosition.set(...sample.position);
      bodyRotationZ = sample.rotationZ;
      bodyScaleX = sample.scaleXZ;
      bodyScaleY = sample.scaleY;
      shadowScale = sample.shadowScale;
      shadowOpacity = sample.shadowOpacity;
      movementActive = !sample.done;
      if (sample.done) activeMotionRef.current = null;
    }
    if (motion || pendingSignal) {
      recordCharacterMovementTrace({
        stage: 'FRAME',
        playerId: player.playerId,
        sequence: motion?.sequence ?? pendingSignal?.sequence,
        fromTileId: motion?.fromTileId ?? pendingSignal?.fromTileId,
        toTileId: motion?.toTileId ?? pendingSignal?.toTileId,
        playerTileId: player.tileId,
        displayTileId: player.tileId,
        settledTileId: player.settledTileId,
        rollSequence: motion?.rollSequence ?? pendingSignal?.rollSequence,
        resetEpoch,
        frameSequence,
        schedulerTimestampMs: state.clock.elapsedTime * 1_000,
        targetAnchor: targetX === undefined || targetY === undefined || targetZ === undefined
          ? undefined
          : [targetX, targetY, targetZ],
        activeSequence: motion?.sequence ?? null,
        pendingSignal: pendingSignal !== null,
        elapsedMs: motion ? getAnimationElapsedMs(motion.startedAtMs, nowMs) : undefined,
        frameDeltaMs: delta * 1_000,
        durationMs: motion?.durationMs ?? pendingSignal?.durationMs,
        position: [bodyPosition.x, bodyPosition.y, bodyPosition.z],
      });
    }

    let landingActive = false;
    let landingOffsetY = 0;
    let landingRotationZ = 0;
    let landingScaleX = 1;
    let landingScaleY = 1;
    const landing = activeLandingRef.current;
    if (landing) {
      const landingElapsedMs = getAnimationElapsedMs(landing.startedAtMs, nowMs);
      const landingSample = sampleCharacterLanding(landingElapsedMs, landing.durationMs);
      landingOffsetY = landingSample.offsetY;
      landingRotationZ = landingSample.rotationZ;
      landingScaleX = landingSample.scaleX;
      landingScaleY = landingSample.scaleY;
      landingActive = !landingSample.done;
      if (landingSample.done) activeLandingRef.current = null;
    }

    const reactionWasActive = reactionControllerRef.current.getState() !== null;
    const reactionSample = reactionControllerRef.current.advanceAt(nowMs, reducedMotion);
    const reactionActive = reactionWasActive || !reactionSample.done;
    const currentTileMotionOffsetY = tileMotionController?.getTileOffsetY(player.tileId) ?? 0;
    const activeHop = activeMotionRef.current?.kind === 'TILE_HOP'
      || activeMotionRef.current?.kind === 'JAIL_TRANSFER'
      ? activeMotionRef.current
      : null;
    const bodyTileOffsetY = getCharacterBodyTileOffsetY(
      currentTileMotionOffsetY,
      activeHop !== null && getAnimationElapsedMs(activeHop.startedAtMs, nowMs) < activeHop.durationMs * 0.9,
    );
    const grounding = getCharacterGroundingTransforms(
      [bodyPosition.x, bodyPosition.y, bodyPosition.z],
      targetY ?? bodyPosition.y,
      currentTileMotionOffsetY,
    );
    group.position.set(...grounding.root);
    ground.position.set(...grounding.ground);
    body.position.set(
      grounding.body[0],
      grounding.body[1] + bodyTileOffsetY + landingOffsetY + reactionSample.offsetY,
      grounding.body[2],
    );
    body.rotation.set(0, STANDEE_HEADING_Y, bodyRotationZ + landingRotationZ + reactionSample.rotationZ);
    body.scale.set(
      bodyScaleX * landingScaleX * reactionSample.scaleX,
      bodyScaleY * landingScaleY * reactionSample.scaleY,
      bodyScaleX * landingScaleX * reactionSample.scaleX,
    );
    shadow.scale.set(shadowScale, shadowScale, 1);
    if (shadowMaterialRef.current) shadowMaterialRef.current.opacity = shadowOpacity;
    if (spriteMaterialRef.current) {
      applyStandeeOpacity(spriteMaterialRef.current, texture ? reactionSample.spriteOpacity : 0);
    }

    // The base is written after this card moved, so it is in the same place when the renderer uploads the instance buffers.
    syncStandeeBasesNow();
    if (movementActive || landingActive || reactionActive) invalidate();
  });

  const groundY = anchor?.[1] ?? 0;
  return (
    <group ref={groupRef}>
      <group ref={groundGroupRef} position={[0, groundY + tileMotionOffsetYSnapshot, 0]}>
        <group ref={shadowGroupRef}>
          {buildingContactShadows
            ? (
              <ContactShadow
                scale={definition.shadowScale}
                opacity={CHARACTER_SHADOW_OPACITY}
                materialRef={shadowMaterialRef}
                uniqueMaterial
              />
            )
            : null}
        </group>
      </group>
      <group ref={bodyGroupRef} position={[0, groundY, 0]}>
        <CharacterStandee
          texture={texture}
          definition={definition}
          playerColor={player.color}
          materialRef={spriteMaterialRef}
        />
      </group>
    </group>
  );
}
