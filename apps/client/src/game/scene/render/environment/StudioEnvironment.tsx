import { useContext, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applyCoinEnvironmentMap } from '../../stations/coinVisuals';
import { kitGlassMaterial } from '../../buildings/kit/kitMaterials';
import { isLocalDiagnosticsEnabled } from '../diagnostics/localDiagnostics';
import { useRenderQuality } from '../RenderQualityContext';
import type { RenderTier } from '../renderQuality';
import { markSceneOnce } from '../warmup/sceneMarks';
import { WarmupHostContext } from '../warmup/warmupHost';
import {
  BAKED_STUDIO_HEIGHT,
  BAKED_STUDIO_WIDTH,
  STUDIO_PMREM_SIGMA,
  loadBakedStudioEnvironment,
  studioEnvironmentInputsHash,
} from './bakedStudioEnvironment';
import {
  createStudioEnvironmentScene,
  disposeStudioEnvironmentScene,
} from './createStudioEnvironmentScene';

export { STUDIO_PMREM_SIGMA };

/** Assigns (or clears) the shared studio texture; kept outside the component so effects only call it. */
export function applyStudioEnvironment(
  target: THREE.Scene,
  texture: THREE.Texture | null,
  intensity: number,
  tier: RenderTier = 'high',
): void {
  target.environment = tier === 'balanced' ? null : texture;
  target.environmentIntensity = intensity;
  applyCoinEnvironmentMap(texture);
  kitGlassMaterial.envMap = texture;
  kitGlassMaterial.envMapIntensity = intensity;
  kitGlassMaterial.needsUpdate = true;
}

/** Switches the scene lookup without regenerating the PMREM or rebinding the glossy materials. */
export function setStudioEnvironmentTier(
  target: THREE.Scene,
  texture: THREE.Texture | null,
  tier: RenderTier,
  intensity: number,
): void {
  target.environment = tier === 'balanced' ? null : texture;
  target.environmentIntensity = intensity;
  kitGlassMaterial.envMapIntensity = intensity;
}

declare global {
  interface Window {
    /** Dev/UAT only (`?studioEnv=procedural`): reads the filtered studio back for `scripts/bakeStudioEnvironment.mjs`. */
    __OWN_THE_BLOCK_STUDIO_ENV_BAKE__?: () => { width: number; height: number; inputsHash: string; threeRevision: string; base64: string };
  }
}

function forceProcedural(): boolean {
  return isLocalDiagnosticsEnabled() && new URLSearchParams(window.location.search).get('studioEnv') === 'procedural';
}

/**
 * One environment for the whole scene: standard materials get image-based light, and the coins reuse the very same texture instead
 * of generating a second one. It is the baked half-float PMREM of the procedural studio when that file is current (see
 * `bakedStudioEnvironment.ts`), otherwise the studio is filtered into a PMREM here, which blocks the main thread for about a second
 * cold. Mount it inside an OptionalSceneLayer: a failure leaves the board lit by the direct lights only. The warm-up waits for it
 * (`WarmupHost.waitForEnvironment`), because a lit material's program depends on the environment.
 */
export default function StudioEnvironment() {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const invalidate = useThree(state => state.invalidate);
  const { tier, environmentIntensity } = useRenderQuality();
  const warmupHost = useContext(WarmupHostContext);
  // R3F swaps `invalidate` for the frame scheduler's once the canvas exists. Reading it through a ref keeps that swap from
  // re-running this effect, which would build the environment a second time.
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;
  const intensityRef = useRef(environmentIntensity);
  intensityRef.current = environmentIntensity;
  const tierRef = useRef(tier);
  tierRef.current = tier;
  const textureRef = useRef<THREE.Texture | null>(null);

  useEffect(() => {
    markSceneOnce('env-start');
    let cancelled = false;
    let release: (() => void) | null = null;

    const apply = (texture: THREE.Texture, dispose: () => void): void => {
      textureRef.current = texture;
      applyStudioEnvironment(scene, texture, intensityRef.current, tierRef.current);
      markSceneOnce('env-end');
      release = () => {
        textureRef.current = null;
        applyStudioEnvironment(scene, null, 1, tierRef.current);
        dispose();
        invalidateRef.current();
      };
      warmupHost.markEnvironmentSettled();
      invalidateRef.current();
    };

    const filterProcedurally = (): void => {
      const pmrem = new THREE.PMREMGenerator(gl);
      let studio: THREE.Scene | null = null;
      let renderTarget: THREE.WebGLRenderTarget | null = null;
      const allocatedTargets = new Set<THREE.WebGLRenderTarget>();
      let ownershipTransferred = false;
      let resourcesDisposed = false;

      const disposeResources = (): void => {
        if (resourcesDisposed) return;
        resourcesDisposed = true;

        const targets = new Set(allocatedTargets);
        if (renderTarget) targets.add(renderTarget);
        try {
          targets.forEach(target => target.dispose());
        } finally {
          try {
            if (studio) disposeStudioEnvironmentScene(studio);
          } finally {
            pmrem.dispose();
          }
        }
      };

      try {
        studio = createStudioEnvironmentScene();

        // Three.js keeps fromScene's output target local until the full bake succeeds. Capture it during this
        // synchronous call so an exception after allocation still leaves the target reachable for cleanup.
        const generatorInternals = pmrem as THREE.PMREMGenerator & {
          _allocateTargets?: () => THREE.WebGLRenderTarget;
        };
        const allocateTargets = generatorInternals._allocateTargets;
        if (allocateTargets) {
          generatorInternals._allocateTargets = function () {
            const target = allocateTargets.call(this);
            allocatedTargets.add(target);
            return target;
          };
        }

        try {
          renderTarget = pmrem.fromScene(studio, STUDIO_PMREM_SIGMA);
        } finally {
          if (allocateTargets) generatorInternals._allocateTargets = allocateTargets;
        }

        if (isLocalDiagnosticsEnabled()) {
          window.__OWN_THE_BLOCK_STUDIO_ENV_BAKE__ = () => {
            const pixels = new Uint16Array(BAKED_STUDIO_WIDTH * BAKED_STUDIO_HEIGHT * 4);
            gl.readRenderTargetPixels(renderTarget!, 0, 0, BAKED_STUDIO_WIDTH, BAKED_STUDIO_HEIGHT, pixels);
            let binary = '';
            const bytes = new Uint8Array(pixels.buffer);
            for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            return { width: BAKED_STUDIO_WIDTH, height: BAKED_STUDIO_HEIGHT, inputsHash: studioEnvironmentInputsHash(), threeRevision: THREE.REVISION, base64: btoa(binary) };
          };
        }
        apply(renderTarget.texture, () => {
          delete window.__OWN_THE_BLOCK_STUDIO_ENV_BAKE__;
          disposeResources();
        });
        ownershipTransferred = true;
      } finally {
        if (!ownershipTransferred) {
          delete window.__OWN_THE_BLOCK_STUDIO_ENV_BAKE__;
          disposeResources();
        }
      }
    };

    const settleWithoutEnvironment = (error: unknown): void => {
      console.warn('[scene] the studio environment could not be built; the board is lit by the direct lights only.', error);
      warmupHost.markEnvironmentSettled();
    };

    if (forceProcedural()) {
      try { filterProcedurally(); } catch (error) { settleWithoutEnvironment(error); }
    } else {
      void loadBakedStudioEnvironment().then(texture => {
        if (cancelled) {
          texture?.dispose();
          return;
        }
        if (texture) {
          apply(texture, () => texture.dispose());
          return;
        }
        filterProcedurally();
      }).catch(settleWithoutEnvironment);
    }

    return () => {
      cancelled = true;
      release?.();
    };
  }, [gl, scene, warmupHost]);

  useEffect(() => {
    setStudioEnvironmentTier(scene, textureRef.current, tier, environmentIntensity);
    invalidate();
  }, [environmentIntensity, invalidate, scene, tier]);

  return null;
}
