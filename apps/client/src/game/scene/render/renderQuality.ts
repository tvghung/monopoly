import type { GraphicsQualitySetting } from '../../../settings/types';

/**
 * Graphics quality tiers of Visual Overhaul V2 (plan 02 §8.8). This module is pure (no three.js, no
 * React) so the resolution rules and the per-tier table stay unit-testable without WebGL.
 */
export type RenderTier = 'high' | 'balanced' | 'low';

export const GRAPHICS_QUALITY_SETTINGS = ['auto', 'high', 'balanced', 'low'] as const satisfies readonly GraphicsQualitySetting[];

export interface RenderQualityConfig {
  tier: RenderTier;
  /** Canvas device pixel ratio range `[min, max]`. */
  dpr: readonly [number, number];
  /** Scene tone mapping is always Khronos PBR Neutral; `high` applies it in the post chain instead. */
  toneMappingInPost: boolean;
  environmentIntensity: number;
  /** Key-light shadow map; `mapSize` 0 means shadows are off. */
  shadows: { enabled: boolean; mapSize: number };
  /** Cheap blob shadows under buildings stay on only while real shadows are off. */
  buildingContactShadows: boolean;
  groundDecalOpacity: number;
  postProcessing: boolean;
  tableTextureSize: number;
  tableRoughnessVariation: boolean;
  /** DOM paper grain (plan 01) is skipped in the low tier. */
  paperGrain: boolean;
}

export const RENDER_QUALITY_CONFIGS: Record<RenderTier, RenderQualityConfig> = {
  low: {
    tier: 'low',
    dpr: [1, 1.25],
    toneMappingInPost: false,
    environmentIntensity: 0.6,
    shadows: { enabled: false, mapSize: 0 },
    buildingContactShadows: true,
    groundDecalOpacity: 0.35,
    postProcessing: false,
    tableTextureSize: 512,
    tableRoughnessVariation: false,
    paperGrain: false,
  },
  balanced: {
    tier: 'balanced',
    dpr: [1.25, 1.5],
    toneMappingInPost: false,
    environmentIntensity: 0.7,
    shadows: { enabled: true, mapSize: 1024 },
    buildingContactShadows: false,
    groundDecalOpacity: 0.18,
    postProcessing: false,
    tableTextureSize: 1024,
    tableRoughnessVariation: false,
    paperGrain: true,
  },
  high: {
    tier: 'high',
    dpr: [1.25, 2],
    toneMappingInPost: true,
    environmentIntensity: 0.8,
    shadows: { enabled: true, mapSize: 2048 },
    buildingContactShadows: false,
    groundDecalOpacity: 0.18,
    postProcessing: true,
    tableTextureSize: 1024,
    tableRoughnessVariation: true,
    paperGrain: true,
  },
};

/** What `auto` looks at. All fields are plain values so tests can supply any device. */
export interface RenderCapabilityProbe {
  coarsePointer: boolean;
  /** `(hover: none)`: touch-first device. */
  hoverNone: boolean;
  /** The larger of the screen's width and height, in CSS pixels. */
  longestScreenSide: number;
  maxTextureSize: number;
  hardwareConcurrency: number;
}

const LOW_TIER_MAX_PHONE_SIDE = 1024;
const LOW_TIER_MIN_TEXTURE_SIZE = 8192;
const LOW_TIER_MAX_CORES = 4;

/** `low` when the device looks weak or mobile, otherwise `balanced`; `auto` never picks `high`. */
export function resolveAutoTier(probe: RenderCapabilityProbe): RenderTier {
  const smallTouchScreen = probe.coarsePointer && probe.longestScreenSide <= LOW_TIER_MAX_PHONE_SIDE;
  const mobileProfile = probe.coarsePointer && probe.hoverNone;
  const weakGpu = probe.maxTextureSize < LOW_TIER_MIN_TEXTURE_SIZE;
  const fewCores = probe.hardwareConcurrency <= LOW_TIER_MAX_CORES;
  return smallTouchScreen || mobileProfile || weakGpu || fewCores ? 'low' : 'balanced';
}

function isGraphicsQualitySetting(value: unknown): value is GraphicsQualitySetting {
  return typeof value === 'string' && (GRAPHICS_QUALITY_SETTINGS as readonly string[]).includes(value);
}

export function resolveRenderTier(setting: unknown, probe: RenderCapabilityProbe): RenderTier {
  const safeSetting: GraphicsQualitySetting = isGraphicsQualitySetting(setting) ? setting : 'auto';
  return safeSetting === 'auto' ? resolveAutoTier(probe) : safeSetting;
}

export function resolveRenderQuality(setting: unknown, probe: RenderCapabilityProbe): RenderQualityConfig {
  return RENDER_QUALITY_CONFIGS[resolveRenderTier(setting, probe)];
}

interface ProbeEnvironment {
  matchMedia?: (query: string) => { matches: boolean };
  screen?: { width: number; height: number };
  navigator?: { hardwareConcurrency?: number };
}

/** Structural subset of a WebGL renderer/context the probe can read the texture limit from. */
export interface MaxTextureSizeSource {
  capabilities?: { maxTextureSize?: number };
}

let cachedMaxTextureSize: number | null = null;

/** One throwaway WebGL context for the whole page, only when no renderer is available yet. */
function readMaxTextureSizeFromContext(): number {
  if (cachedMaxTextureSize !== null) return cachedMaxTextureSize;
  let size = 0;
  // No WebGL in this environment (for example jsdom): skip the throwaway context entirely.
  if (typeof WebGL2RenderingContext === 'undefined' && typeof WebGLRenderingContext === 'undefined') {
    cachedMaxTextureSize = 0;
    return 0;
  }
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (context) {
      const value: unknown = context.getParameter(context.MAX_TEXTURE_SIZE);
      size = typeof value === 'number' ? value : 0;
    }
  } catch {
    size = 0;
  }
  cachedMaxTextureSize = size;
  return size;
}

/**
 * Reads the device facts `auto` needs. Pass the three.js renderer when one exists; otherwise a cached
 * throwaway context supplies the texture limit. Unknown values fall on the side of `low`.
 */
export function probeRenderCapabilities(
  renderer?: MaxTextureSizeSource,
  environment: ProbeEnvironment = typeof window === 'undefined'
    ? {}
    : {
      matchMedia: window.matchMedia?.bind(window),
      screen: window.screen,
      navigator: window.navigator,
    },
): RenderCapabilityProbe {
  const matches = (query: string) => environment.matchMedia?.(query).matches ?? false;
  const screenSize = environment.screen ?? { width: 0, height: 0 };
  const rendererTextureSize = renderer?.capabilities?.maxTextureSize;
  return {
    coarsePointer: matches('(pointer: coarse)'),
    hoverNone: matches('(hover: none)'),
    longestScreenSide: Math.max(screenSize.width, screenSize.height),
    maxTextureSize: typeof rendererTextureSize === 'number' && rendererTextureSize > 0
      ? rendererTextureSize
      : readMaxTextureSizeFromContext(),
    hardwareConcurrency: environment.navigator?.hardwareConcurrency ?? 1,
  };
}
