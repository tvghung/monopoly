import { useContext, useEffect, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { isLocalDiagnosticsEnabled } from '../diagnostics/localDiagnostics';
import { useRenderQuality } from '../RenderQualityContext';
import { runShaderWarmup, type WarmupReason, type WarmupReport } from './warmupRunner';
import type { CompileBatch, WarmupRenderer } from './shaderCompile';
import { WarmupFixtures } from './warmupFixtures';
import { WarmupHostContext, type PostChain } from './warmupHost';
import { collectPostChainMaterials, createFullscreenTriangle } from './warmupPostChain';
import { collectTextures, uploadTextures } from './warmupTextures';

/** A program that is not ready after this long ends the warm-up as incomplete and the board draws anyway. */
export const WARMUP_TIMEOUT_MS = 12_000;

/** How long the high tier waits for its lazily loaded post-processing chunk before warming the scene without it. */
export const POST_CHAIN_WAIT_MS = 5_000;

/** How long the warm-up waits for the studio environment (a download and an upload) before compiling without it. */
export const ENVIRONMENT_WAIT_MS = 5_000;

declare global {
  interface Window {
    /** Dev/UAT only: the report of the latest warm-up, for the performance probe and the tests. */
    __OWN_THE_BLOCK_WARMUP__?: WarmupReport;
  }
}

/** The scene's target and the chain's own programs on the high tier; the screen and nothing else when the chain is missing. */
function resolvePostChain(chain: PostChain | null): { sceneTarget: THREE.WebGLRenderTarget | null; batches: CompileBatch[] } {
  if (!chain) return { sceneTarget: null, batches: [] };
  const triangle = createFullscreenTriangle();
  const buffered = new THREE.Group();
  const onScreen = new THREE.Group();
  for (const entry of collectPostChainMaterials(chain)) {
    (entry.toScreen ? onScreen : buffered).add(new THREE.Mesh(triangle, entry.material));
  }
  return {
    sceneTarget: chain.inputBuffer,
    batches: [
      { name: 'post:buffers', object: buffered, renderTarget: chain.inputBuffer },
      { name: 'post:screen', object: onScreen, renderTarget: null },
    ],
  };
}

function emitMark(name: string, detail?: Record<string, unknown>): void {
  try {
    performance.mark?.(name, detail ? { detail } : undefined);
  } catch {
    // A mark is an observation; a browser without the options overload simply records no detail.
    try { performance.mark?.(name); } catch { /* not observable here */ }
  }
}

/**
 * Prepares the scene's shader programs before the board draws (Phase B3, PERF-05). It renders nothing. The first warm-up
 * of a canvas runs while the frame stream is held; a change of graphics tier holds the stream again, compiles the programs
 * of the new tier (shadow flags, lights and the tone mapper are what change the variants) and only then lets the next frame
 * draw, so the picture on screen stays the old tier until the new one can be drawn without a stall.
 */
export default function ShaderWarmup() {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const getState = useThree(state => state.get);
  const host = useContext(WarmupHostContext);
  const quality = useRenderQuality();
  const runsRef = useRef(0);
  const fixturesRef = useRef<WarmupFixtures | null>(null);
  const [contextEpoch, setContextEpoch] = useState(0);
  const lastEpochRef = useRef(0);

  // A restored context has lost every program; compile them again before the next frame.
  useEffect(() => {
    const canvas = gl.domElement;
    const onRestored = () => setContextEpoch(epoch => epoch + 1);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => canvas.removeEventListener('webglcontextrestored', onRestored);
  }, [gl]);

  // The stand-in objects live as long as the renderer: they keep the variants they compile cached (see warmupFixtures).
  useEffect(() => () => {
    fixturesRef.current?.dispose();
    fixturesRef.current = null;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const reason: WarmupReason = runsRef.current === 0
      ? 'initial'
      : lastEpochRef.current !== contextEpoch ? 'context-restored' : 'tier-switch';
    lastEpochRef.current = contextEpoch;
    runsRef.current += 1;
    host.hold();
    const buildStartedAt = performance.now();
    const fixtures = fixturesRef.current ?? new WarmupFixtures();
    fixturesRef.current = fixtures;
    fixtures.syncShadowCasters(scene);
    fixtures.addStandee();
    fixtures.addDice(quality.tier);
    fixtures.addDestinationPreview();
    fixtures.addConstruction();
    const fixtureBuildMs = performance.now() - buildStartedAt;
    void runShaderWarmup({
      renderer: gl as unknown as WarmupRenderer,
      scene,
      camera,
      fixtures: [
        { name: 'fixtures:main', object: fixtures.main },
        // Shadow depth programs exist only while shadows are on (the low tier compiles none).
        ...(gl.shadowMap.enabled
          ? [{ name: 'fixtures:shadow-depth', object: fixtures.depth, renderTarget: fixtures.depthTarget }]
          : []),
      ],
      reason,
      tier: quality.tier,
      fixtureBuildMs,
      prerequisite: signal => host.waitForEnvironment(signal, ENVIRONMENT_WAIT_MS),
      resolveTier: quality.postProcessing
        ? async signal => resolvePostChain(await host.waitForPostChain(signal, POST_CHAIN_WAIT_MS))
        : undefined,
      steps: [{
        name: 'textures',
        run: ({ signal, deadlineMs }) => uploadTextures(gl, collectTextures([scene]), { signal, deadlineMs }),
      }],
      signal: controller.signal,
      timeoutMs: WARMUP_TIMEOUT_MS,
      mark: emitMark,
    }).then(report => {
      if (isLocalDiagnosticsEnabled()) window.__OWN_THE_BLOCK_WARMUP__ = report;
      // A cancelled run was replaced by a newer one, which keeps the hold until it ends itself.
      if (controller.signal.aborted) return;
      host.release();
      // The held frames were never drawn: ask for the one that shows the current state.
      getState().invalidate();
    });
    return () => controller.abort();
  }, [camera, contextEpoch, getState, gl, host, quality.postProcessing, quality.tier, scene]);

  return null;
}
