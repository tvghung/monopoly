import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applyCoinEnvironmentMap } from '../../stations/coinVisuals';
import { useRenderQuality } from '../RenderQualityContext';
import {
  createStudioEnvironmentScene,
  disposeStudioEnvironmentScene,
} from './createStudioEnvironmentScene';

/** Blur applied while filtering the studio into the PMREM (plan 02 §8.4). */
export const STUDIO_PMREM_SIGMA = 0.04;

/** Assigns (or clears) the shared studio texture; kept outside the component so effects only call it. */
export function applyStudioEnvironment(
  target: THREE.Scene,
  texture: THREE.Texture | null,
  intensity: number,
): void {
  target.environment = texture;
  target.environmentIntensity = intensity;
  applyCoinEnvironmentMap(texture);
}

/** Changes only the intensity, so switching graphics tier never regenerates the PMREM. */
export function setStudioEnvironmentIntensity(target: THREE.Scene, intensity: number): void {
  target.environmentIntensity = intensity;
}

/**
 * One PMREM of the procedural studio for the whole scene: standard materials get image-based light,
 * and the coins reuse the very same texture instead of generating a second one. Mount it inside an
 * OptionalSceneLayer: a failure leaves the board lit by the direct lights only.
 */
export default function StudioEnvironment() {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const invalidate = useThree(state => state.invalidate);
  const { environmentIntensity } = useRenderQuality();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const studio = createStudioEnvironmentScene();
    const renderTarget = pmrem.fromScene(studio, STUDIO_PMREM_SIGMA);
    applyStudioEnvironment(scene, renderTarget.texture, environmentIntensity);
    invalidate();
    return () => {
      applyStudioEnvironment(scene, null, 1);
      renderTarget.dispose();
      disposeStudioEnvironmentScene(studio);
      pmrem.dispose();
      invalidate();
    };
    // The intensity is applied separately below so a tier switch never regenerates the PMREM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, invalidate, scene]);

  useEffect(() => {
    setStudioEnvironmentIntensity(scene, environmentIntensity);
    invalidate();
  }, [environmentIntensity, invalidate, scene]);

  return null;
}
