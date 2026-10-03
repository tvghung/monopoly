import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { useRenderQuality } from '../RenderQualityContext';
import { SHADOW_ONLY_LAYER } from '../shadowLayers';
import { LIGHT_RIG } from './lightRigSpec';

/** Frees the light's shadow map so the renderer allocates a new one at the current `mapSize`; false when there was none yet. */
export function dropShadowMap(light: THREE.DirectionalLight | null): boolean {
  const shadow = light?.shadow;
  if (!shadow?.map) return false;
  shadow.map.dispose();
  shadow.map = null;
  return true;
}

/**
 * Key, fill and rim lights of the toy-on-a-table look (plan 02 §8.2). Only the key light ever casts
 * shadows, and only in tiers that have them; the fill is a hemisphere that bounces the oak table color.
 */
export default function SceneLightRig() {
  const { shadows } = useRenderQuality();
  const { key, fill, rim } = LIGHT_RIG;
  const keyLight = useRef<THREE.DirectionalLight>(null);
  // The shadow camera sees the default layer and the shadow-only layer; the main camera sees only the default one.
  useEffect(() => {
    keyLight.current?.shadow.camera.layers.enable(SHADOW_ONLY_LAYER);
  }, []);
  // three.js allocates the shadow map once and never notices a new `mapSize`: switching balanced <-> high at runtime left a
  // 1024 map under 2048 settings and the shadows came out mis-scaled. Dropping the map makes the next frame allocate it again.
  const invalidate = useThree(state => state.invalidate);
  useEffect(() => {
    if (dropShadowMap(keyLight.current)) invalidate();
  }, [invalidate, shadows.enabled, shadows.mapSize]);
  return (
    <>
      <hemisphereLight name="FillLight" args={[fill.skyColor, fill.groundColor, fill.intensity]} />
      <directionalLight
        ref={keyLight}
        name="KeyLight"
        position={[...key.position]}
        color={key.color}
        intensity={key.intensity}
        castShadow={shadows.enabled}
        shadow-mapSize={[shadows.mapSize, shadows.mapSize]}
        shadow-camera-left={-key.shadow.halfExtent}
        shadow-camera-right={key.shadow.halfExtent}
        shadow-camera-top={key.shadow.halfExtent}
        shadow-camera-bottom={-key.shadow.halfExtent}
        shadow-camera-near={key.shadow.near}
        shadow-camera-far={key.shadow.far}
        shadow-bias={key.shadow.bias}
        shadow-normalBias={key.shadow.normalBias}
        shadow-radius={key.shadow.radius}
      />
      <directionalLight name="RimLight" position={[...rim.position]} color={rim.color} intensity={rim.intensity} />
    </>
  );
}
