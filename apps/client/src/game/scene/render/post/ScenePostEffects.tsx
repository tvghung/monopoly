import { useEffect, useRef } from 'react';
import {
  Bloom, EffectComposer, N8AO, ToneMapping, Vignette,
} from '@react-three/postprocessing';
import { ToneMappingMode, type EffectComposer as EffectComposerImpl } from 'postprocessing';
import { registerComposerPassCounter } from '../diagnostics/composerPasses';
import {
  POST_AMBIENT_OCCLUSION,
  POST_BLOOM,
  POST_MULTISAMPLING,
  POST_VIGNETTE,
} from './postSettings';

/** The parts of the N8AO pass this chain configures beyond its React props. */
interface AmbientOcclusionPass {
  configuration: { gammaCorrection: boolean; transparencyAware: boolean };
}

/**
 * N8AO detects transparent materials and, when it finds any, re-renders the whole scene twice more to
 * separate them from the occluders (well over a hundred extra draw calls here). The board's transparent
 * layers are decals and text on top of opaque surfaces, so they may take the ambient occlusion of the
 * surface below. It must also leave its output linear: the final effect pass applies the tone mapper
 * and the sRGB encoding once.
 */
function configureAmbientOcclusionPass(pass: AmbientOcclusionPass | null): void {
  if (!pass) return;
  pass.configuration.gammaCorrection = false;
  pass.configuration.transparencyAware = false;
}

/**
 * High-tier post-processing. Loaded lazily and only for `high`, so the other tiers never download it.
 * The chain ends with the Neutral tone mapper; `GameScene` sets the Canvas tone mapping to none for this
 * tier, so the scene is tone mapped exactly once.
 */
export default function ScenePostEffects() {
  const composerRef = useRef<EffectComposerImpl | null>(null);

  // The scene render pass draws the board rather than filtering an image, so it is not counted.
  useEffect(() => registerComposerPassCounter(
    () => composerRef.current?.passes.filter(pass => pass.enabled && pass.name !== 'RenderPass').length ?? 0,
  ), []);

  return (
    <EffectComposer ref={composerRef} multisampling={POST_MULTISAMPLING}>
      <N8AO ref={configureAmbientOcclusionPass} {...POST_AMBIENT_OCCLUSION} />
      <Bloom {...POST_BLOOM} />
      <Vignette {...POST_VIGNETTE} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
